// =========================================================
// 상태 관리
// =========================================================
const state = {
  npcs: [],
  day: 1,
  timeOfDay: 0.32,
  phase: 'morning',
  selectedNpcId: null,
  chatHistory: {},
  // [9.5단계] NPC별 오래된 대화의 장기 요약. 키: npcId, 값: 누적 요약 문자열.
  //           chatHistory 가 20턴 넘으면 오래된 15턴을 요약해 여기에 누적하고
  //           chatHistory 는 최근 5턴만 남긴다.
  longTermSummary: {},
  rumors: [],
  reports: [],
  quests: [],
  activeTab: 'chat',
  activeQuestId: null,
  loading: false,
  viewMode: 'village',
  currentInterior: null,
  // [8단계 제거] storyStage 필드 삭제. 시나리오 엔진의 currentStage 로 일원화.
  //              참조는 scenarioEngine.state.currentStage 로 대체.
  //              값 매핑: day1→dormant, day2_triggered→triggered, 나머지 동일.
  storyOpeningShown: false,
  // 유저 아바타 상태
  user: {
    mesh: null,           // THREE.Group (createUserMesh 결과)
    position: { x: 0, z: 0 },
    targetPos: null,      // { x, z } or null
    moving: false,
    speed: 3.5,           // NPC(2.0)보다 살짝 빠름
    bounce: 0,            // 걷기 애니메이션용
    pendingNpcId: null,   // 이 NPC에게 가서 대화하려고 이동 중
    isSleeping: false,    // 침대에서 자는 중인가
  },
  // 오프라인 시뮬레이션 상태
  simulation: {
    active: false,        // 시뮬레이션 진행 중?
    startTime: 0,         // 시작한 performance.now() 값
    // [카테고리 1 수정] Day 1 시네마틱이 총 20초 설계인데 3배속이면 at 범위 초과 →
    // Day 1 에선 1배속으로 느긋하게, 다른 날 밤엔 기본 3배속 유지.
    speed: 3,             // 시간 흐름 배속 (기본 3배)
    eventsFired: new Set(), // 이미 발동된 이벤트 id들
    cameraMode: 'cinematic', // 'cinematic' or 'free'
    cinematicTarget: null,   // 카메라가 추적 중인 npc id
  },
};

// NPC와 대화 가능한 최소 거리 (월드 유닛)
const INTERACTION_RANGE = 3.0; // 약 3칸

// 캐릭터 반경 (충돌용)
const CHARACTER_RADIUS = 0.5;

// =========================================================
// 충돌 해소 — 이동 후 위치를 받아 장애물·다른 캐릭터와 겹치지 않도록 밀어냄
// =========================================================
// pos: {x, z} (수정됨), self: 제외할 자기 자신 (유저는 null, NPC는 npc id)
function resolveCollisions(pos, self) {
  // 월드 경계 내로 clamp
  pos.x = Math.max(-19, Math.min(19, pos.x));
  pos.z = Math.max(-19, Math.min(19, pos.z));
  
  // 1) 정적 장애물 — 건물만 막음 (나무·연못은 통과 허용)
  for (const ob of obstacles) {
    if (ob.type !== 'building') continue;
    const dx = pos.x - ob.x;
    const dz = pos.z - ob.z;
    const dist = Math.hypot(dx, dz);
    const minDist = ob.radius + CHARACTER_RADIUS;
    if (dist < minDist && dist > 0.001) {
      // 건물 중심에서 멀어지는 방향으로 밀어내기
      const push = (minDist - dist);
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    } else if (dist < 0.001) {
      pos.x += minDist;
    }
  }
  
  // 2) NPC 간 충돌
  const selfRadius = CHARACTER_RADIUS;
  const otherRadius = CHARACTER_RADIUS;
  const minPairDist = selfRadius + otherRadius;
  
  // 유저와의 충돌 (self가 npc인 경우)
  if (self !== 'user' && state.user && state.user.mesh) {
    const dx = pos.x - state.user.mesh.position.x;
    const dz = pos.z - state.user.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < minPairDist && dist > 0.001) {
      const push = (minPairDist - dist);
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
  
  // NPC끼리의 충돌
  for (const [otherId, other] of Object.entries(npcMeshes)) {
    if (self === otherId) continue;
    if (!other.mesh) continue;
    const dx = pos.x - other.mesh.position.x;
    const dz = pos.z - other.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < minPairDist && dist > 0.001) {
      const push = (minPairDist - dist);
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
}

// =========================================================
// 시나리오 스크립트 — 각 Day마다 밤에 벌어지는 NPC 동선
// =========================================================
// 각 이벤트는 timeOfDay(0~1) 시점에 발동. 유저가 자는 동안 진행됨.
// 타입: 'move' (npc가 좌표로 이동), 'dialog' (말풍선), 'camera' (카메라 포커스)
const NIGHT_SCRIPTS = {
  1: [ // Day 1 밤 — 야미 책 픽업 + 차카 서점 근처 야경 촬영
    // [카테고리 1 수정] 5개 덩어리 × 4초 = 총 20초. sim.speed=1 전제.
    // narration 은 move/camera 와 같은 at 에 배치해 동시 재생.

    // 장면 1 (0.76 ~ 0.82): 분위기 설정
    { id: 'd1_s1_intro', at: 0.76, type: 'narration',
      text: '밤이 깊어가는 동네...' },

    // 장면 2 (0.82 ~ 0.88): 야미가 서점으로 이동 + 카메라 야미
    { id: 'd1_s2_yami_move', at: 0.82, type: 'move', npc: '야미',
      to: { x: 7.5, z: 3.5 },
      narration: '야미가 예약해 둔 책을 픽업하러 서점에 가고 있네요.' },
    { id: 'd1_s2_yami_cam',  at: 0.82, type: 'camera', npc: '야미' },

    // 장면 3 (0.88 ~ 0.94): 차카가 서점 근처에서 서성임 + 카메라 차카
    // (이 시점에 카메라가 차카로 전환되므로 야미의 서점 도착 모습은 화면 밖)
    { id: 'd1_s3_chaka_move', at: 0.88, type: 'move', npc: '차카',
      to: { x: 5, z: 4 },
      narration: '차카는 동네의 야경을 카메라로 담고 있어요.' },
    { id: 'd1_s3_chaka_cam',  at: 0.88, type: 'camera', npc: '차카' },

    // 장면 4 (0.94 ~ 1.00): 차카가 서점 앞으로 이동해서 멈춤 + 카메라 유지
    { id: 'd1_s4_chaka_stop', at: 0.94, type: 'move', npc: '차카',
      to: { x: 6, z: 3.2 },
      narration: '서점과 동네의 풍경을 담았어요.' },
    { id: 'd1_s4_chaka_cam',  at: 0.94, type: 'camera', npc: '차카' },

    // 장면 5 (1.00 ~ 1.06): 야미가 서점에서 나와 광장으로 이동 + 카메라 야미
    { id: 'd1_s5_yami_home',  at: 1.00, type: 'move', npc: '야미',
      to: { x: 0, z: 0 },
      narration: '야미가 예약한 책을 픽업해서 집으로 돌아가요.' },
    { id: 'd1_s5_yami_cam',   at: 1.00, type: 'camera', npc: '야미' },

    // 장면 종료
    { id: 'd1_end', at: 1.06, type: 'end' },
  ],
  // Day 2, 3 밤은 별도 카테고리에서 다룸
};

function showNotification(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function showStoryModal(title, body) {
  document.getElementById('story-modal-title').textContent = title;
  document.getElementById('story-modal-body').textContent = body;
  document.getElementById('story-modal').classList.add('show');
}
window.__closeStoryModal = function() {
  document.getElementById('story-modal').classList.remove('show');
};

// =========================================================
// 확인 모달 (예/아니오 선택)
// =========================================================
function showConfirmModal(title, body, onYes, yesLabel = '예', noLabel = '아니오') {
  // 기존 모달이 있으면 제거
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'story-modal show';
  // 인라인 스타일로 오버레이 레이아웃 강제 (CSS에 .story-modal 클래스 규칙이 없어서)
  modal.style.cssText =
    'position: fixed; inset: 0; z-index: 600;' +
    'background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);' +
    'display: flex; align-items: center; justify-content: center; padding: 20px;';
  modal.innerHTML = `
    <div class="story-modal-content" style="background: white; border-radius: 24px; padding: 28px 24px; max-width: 440px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); border: 3px solid #fde8ec;">
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #3a2a1a;">${title}</h2>
      <p style="margin: 0 0 20px; line-height: 1.6; color: #555; white-space: pre-line;">${body}</p>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="confirm-no-btn" style="padding: 10px 20px; border: 1.5px solid #ccc; background: white; border-radius: 10px; cursor: pointer; font-size: 14px; color: #666;">${noLabel}</button>
        <button id="confirm-yes-btn" style="padding: 10px 20px; border: none; background: linear-gradient(135deg, #7ab8e8, #5a98c8); color: white; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: bold;">${yesLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    modal.remove();
    if (onYes) onYes();
  });
  document.getElementById('confirm-no-btn').addEventListener('click', () => {
    modal.remove();
  });
}

// =========================================================
// 침대 클릭 처리 (오프라인 시뮬레이션 진입점)
// =========================================================
function handleBedClick() {
  // 집이 아닌 곳에서 침대 클릭은 무시
  if (!state.currentInterior || state.currentInterior.name !== '우리집') return;
  
  const dayNum = state.day;
  const phaseKor = state.phase === 'morning' ? '아침' : state.phase === 'afternoon' ? '오후' : state.phase === 'evening' ? '저녁' : '밤';
  
  showConfirmModal(
    '🛏️ 침대에 누울까요?',
    `지금은 Day ${dayNum} ${phaseKor}이에요.\n자고 일어나면 다음 날 아침이 됩니다.\n\n자는 동안 동네에서 벌어지는 일들을 관찰할 수 있어요.`,
    () => {
      startSleepSequence();
    },
    '잠들기',
    '아직 안 자'
  );
}

// 플레이스홀더: 3단계에서 본격 구현 예정
function startSleepSequence() {
  // 침대에서 자기 시작 → 화면 어두워지고 → NPC 시뮬레이션 시작
  state.user.isSleeping = true;
  
  // 해당 Day의 밤 스크립트가 없으면 기존 방식(즉시 다음날)으로 폴백
  if (!NIGHT_SCRIPTS[state.day]) {
    showNotification('💤 자러 가요...');
    fadeToBlack(1500, () => {
      if (state.viewMode === 'interior') exitInterior();
      advanceToNightAndMorning();
      state.user.isSleeping = false;
      setTimeout(() => fadeFromBlack(1200), 500);
    });
    return;
  }
  
  showNotification('💤 잠들고 있어요...');
  
  fadeToBlack(1500, () => {
    // 1) 인테리어에서 나와 마을 뷰로 전환
    if (state.viewMode === 'interior') exitInterior();
    
    // 2) 시뮬레이션 시작 상태로 세팅
    const sim = state.simulation;
    sim.active = true;
    sim.startTime = performance.now();
    sim.eventsFired = new Set();
    sim.cameraMode = 'cinematic';
    sim.cinematicTarget = null;
    // [카테고리 1 수정] Day 1 은 느긋하게 (4초 간격 연출 설계), 그 외엔 기본 3배속
    sim.speed = (state.day === 1) ? 1 : 3;
    
    // 3) 현재 시각을 "저녁 시작"으로 맞춤 (0.75 부근부터 스크립트 진행)
    state.timeOfDay = 0.74;
    state.phase = 'evening';
    
    // 4) 카메라 초기 위치 — 광장 중앙에서 약간 떨어져 동네 전체 조망
    cameraAngle = Math.PI / 4;
    cameraPitch = Math.PI / 3.5;
    cameraDist = 28;
    cameraTarget.set(0, 0, 0);
    updateCamera();
    
    // 5) 시뮬레이션 UI 표시
    showSimulationUI();
    
    // 6) 페이드 인
    setTimeout(() => fadeFromBlack(1000), 300);
  });
}

// 시뮬레이션 UI (배속 표시 + 스킵 버튼 + 이벤트 알림)
function showSimulationUI() {
  let ui = document.getElementById('simulation-ui');
  if (ui) ui.remove();
  ui = document.createElement('div');
  ui.id = 'simulation-ui';
  ui.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    z-index: 9999; display: flex; align-items: center; gap: 12px;
    background: rgba(20, 20, 30, 0.85); color: white; padding: 10px 18px;
    border-radius: 999px; font-size: 14px; backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.15);
  `;
  ui.innerHTML = `
    <span style="display:flex; align-items:center; gap:6px;">🌙 <span id="sim-phase-label">밤이 깊어가요</span></span>
    <span style="opacity:0.4;">·</span>
    <span id="sim-event-label" style="color:#ffd4a0; min-width: 140px; text-align:center; transition:opacity 0.3s;"></span>
    <span style="opacity:0.4;">·</span>
    <button id="sim-skip-btn" style="background:#4a4a5a; border:none; color:white; padding:6px 14px; border-radius:999px; cursor:pointer; font-size:13px;">⏭ 건너뛰기</button>
  `;
  document.body.appendChild(ui);
  document.getElementById('sim-skip-btn').addEventListener('click', () => {
    endSimulation();
  });
  // UI 잠금 (사이드 패널 클릭 비활성화)
  document.body.classList.add('sim-locked');
}

function hideSimulationUI() {
  const ui = document.getElementById('simulation-ui');
  if (ui) ui.remove();
  // UI 잠금 해제
  document.body.classList.remove('sim-locked');
}

function setSimulationEventLabel(text) {
  const el = document.getElementById('sim-event-label');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = text || '';
    el.style.opacity = '1';
  }, 150);
}

// 스크립트 이벤트 실행
function fireScriptEvent(ev) {
  console.log('[sim] fire event:', ev.id, ev.type);
  
  if (ev.type === 'narration' && ev.text) {
    setSimulationEventLabel(ev.text);
  }
  
  if (ev.type === 'move' && ev.npc && ev.to) {
    const target = state.npcs.find(n => n.name === ev.npc);
    if (target) {
      const mesh = npcMeshes[target.id];
      if (mesh) {
        mesh.scriptedTarget = new THREE.Vector3(ev.to.x, 0, ev.to.z);
        mesh.state = 'walking';
      }
    }
    if (ev.narration) setSimulationEventLabel(ev.narration);
  }
  
  if (ev.type === 'camera' && ev.npc) {
    // 시네마틱 모드일 때만 카메라 이동 (자유 모드면 무시)
    if (state.simulation.cameraMode === 'cinematic') {
      const target = state.npcs.find(n => n.name === ev.npc);
      if (target) {
        state.simulation.cinematicTarget = target.id;
      }
    }
    if (ev.label) {
      // 상단 라벨은 이벤트 라벨로 덮어씌우되 앞에 ★ 표시
      setSimulationEventLabel('★ ' + ev.label);
    }
  }
  
  if (ev.type === 'end') {
    endSimulation();
  }
}

// 매 프레임 호출 — 시뮬레이션 중 스크립트 체크 + 카메라 추적
function runSimulationTick(dt) {
  const sim = state.simulation;
  if (!sim.active) return;
  
  // 1) 시간 흐름 (3배속)
  state.timeOfDay += dt * 0.015 * sim.speed; // 기본 속도의 3배
  if (state.timeOfDay >= 1) state.timeOfDay -= 1;
  
  // phase 업데이트
  const t = state.timeOfDay;
  if (t < 0.25) state.phase = 'night';
  else if (t < 0.5) state.phase = 'morning';
  else if (t < 0.7) state.phase = 'afternoon';
  else if (t < 0.85) state.phase = 'evening';
  else state.phase = 'night';
  
  // phase 라벨 업데이트
  const phaseLabel = document.getElementById('sim-phase-label');
  if (phaseLabel) {
    const phaseKor = { night: '🌙 밤', morning: '🌅 아침', afternoon: '☀️ 오후', evening: '🌆 저녁' }[state.phase] || '';
    phaseLabel.textContent = phaseKor;
  }
  
  // 2) 스크립트 이벤트 체크
  const script = NIGHT_SCRIPTS[state.day] || [];
  // at 값이 0.74보다 작은 이벤트(다음날 아침 등)는 timeOfDay가 한바퀴 돈 값으로 취급
  // 단순화: 시뮬레이션이 시작된 이후 경과한 "가상 시각"을 계산
  const elapsedSec = (performance.now() - sim.startTime) / 1000;
  // 시작 시 timeOfDay=0.74였으므로 가상 시각 = 0.74 + elapsedSec * 0.015 * speed
  const virtualTime = 0.74 + elapsedSec * 0.015 * sim.speed;
  
  for (const ev of script) {
    // ev.at이 0.74보다 작으면(예: 1.05) 다음 날로 봄
    const evTime = ev.at < 0.74 ? ev.at + 1 : ev.at;
    if (virtualTime >= evTime && !sim.eventsFired.has(ev.id)) {
      sim.eventsFired.add(ev.id);
      fireScriptEvent(ev);
    }
  }
  
  // 3) 시네마틱 카메라 추적 (cinematicTarget이 있을 때 부드럽게 따라감)
  if (sim.cameraMode === 'cinematic' && sim.cinematicTarget != null) {
    const targetMesh = npcMeshes[sim.cinematicTarget]?.mesh;
    if (targetMesh) {
      // cameraTarget을 NPC 위치로 부드럽게 lerp
      cameraTarget.x += (targetMesh.position.x - cameraTarget.x) * dt * 2;
      cameraTarget.z += (targetMesh.position.z - cameraTarget.z) * dt * 2;
      // 거리도 살짝 줄여서 가까이 (18 정도)
      cameraDist += (18 - cameraDist) * dt * 1.5;
      updateCamera();
    }
  }
}

// 시뮬레이션 종료 — 페이드 아웃 → 집 복귀 → 다음날 아침
function endSimulation() {
  const sim = state.simulation;
  if (!sim.active) return;
  sim.active = false;
  sim.cinematicTarget = null;
  
  // NPC들의 scriptedTarget 해제
  Object.values(npcMeshes).forEach(n => { n.scriptedTarget = null; });
  
  hideSimulationUI();
  
  fadeToBlack(1200, () => {
    state.user.isSleeping = false;
    
    // 카메라 기본 위치로
    cameraAngle = Math.PI / 4;
    cameraPitch = Math.PI / 3.5;
    cameraDist = 30;
    cameraTarget.set(0, 0, 0);
    updateCamera();
    
    // 기존 advanceToNightAndMorning을 호출해서 리포트/퀘스트 생성 로직이 실행되게 함.
    // 단, 밤 시뮬레이션은 이미 봤으므로 상태를 이미 '다음날 준비된' 것처럼 세팅.
    // advanceToNightAndMorning 내부에서 API 호출 등으로 시간이 걸리므로, 그 사이 페이드 유지.
    advanceToNightAndMorning().then(() => {
      setTimeout(() => fadeFromBlack(1200), 400);
    }).catch(err => {
      console.error('[sim] endSimulation error:', err);
      setTimeout(() => fadeFromBlack(1200), 400);
    });
  });
}

// (참고) triggerDay2OpeningIfNeeded는 더 이상 endSimulation에서 쓰지 않음.
// advanceToNightAndMorning이 Day 2 오프닝을 직접 처리하기 때문에.

// =========================================================
// 페이드 인/아웃 시스템 (화면 전환 효과)
// =========================================================
function ensureFadeOverlay() {
  let overlay = document.getElementById('fade-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fade-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;opacity:0;pointer-events:none;z-index:99998;transition:opacity 0.5s ease;';
    document.body.appendChild(overlay);
  }
  return overlay;
}

function fadeToBlack(durationMs = 1200, onComplete) {
  const overlay = ensureFadeOverlay();
  overlay.style.transition = `opacity ${durationMs}ms ease`;
  overlay.style.pointerEvents = 'auto';
  // 다음 프레임에 opacity 1로 (트랜지션 트리거)
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
  setTimeout(() => {
    if (onComplete) onComplete();
  }, durationMs);
}

function fadeFromBlack(durationMs = 1000, onComplete) {
  const overlay = ensureFadeOverlay();
  overlay.style.transition = `opacity ${durationMs}ms ease`;
  requestAnimationFrame(() => {
    overlay.style.opacity = '0';
  });
  setTimeout(() => {
    overlay.style.pointerEvents = 'none';
    if (onComplete) onComplete();
  }, durationMs);
}

// =========================================================
// 이미지 에셋 시스템
// =========================================================
const ASSET_SLOTS = {
  npc: [
    'chaka_natural', 'chaka_happy', 'chaka_sad', 'chaka_angry', 'chaka_surprised', 'chaka_thinking',
    'yami_natural', 'yami_happy', 'yami_sad', 'yami_angry', 'yami_surprised', 'yami_thinking',
    'bamtol_natural', 'bamtol_happy', 'bamtol_sad', 'bamtol_angry', 'bamtol_surprised', 'bamtol_thinking',
    'somi_natural', 'luru_natural',
  ],
  evidence: [
    'chaka_photo_evidence', 'missing_book_shelf',
    'photostudio_window', 'bookclub_poster',
    'missing_book_found',
    'yami_backpack', // [8단계] bamtol_ledger, book_reservation_slip 제거됨 (엔진-시나리오로 일원화)
  ],
};

const ASSET_META = {
  chaka_natural: { emoji: '📸', label: '차카 평소' },
  chaka_happy: { emoji: '📸', label: '차카 기쁨' },
  chaka_sad: { emoji: '📸', label: '차카 슬픔' },
  chaka_angry: { emoji: '📸', label: '차카 분노' },
  chaka_surprised: { emoji: '📸', label: '차카 놀람' },
  chaka_thinking: { emoji: '📸', label: '차카 고민' },
  yami_natural: { emoji: '📖', label: '야미 평소' },
  yami_happy: { emoji: '📖', label: '야미 기쁨' },
  yami_sad: { emoji: '📖', label: '야미 슬픔' },
  yami_angry: { emoji: '📖', label: '야미 분노' },
  yami_surprised: { emoji: '📖', label: '야미 놀람' },
  yami_thinking: { emoji: '📖', label: '야미 고민' },
  bamtol_natural: { emoji: '📚', label: '밤톨 평소' },
  bamtol_happy: { emoji: '📚', label: '밤톨 기쁨' },
  bamtol_sad: { emoji: '📚', label: '밤톨 슬픔' },
  bamtol_angry: { emoji: '📚', label: '밤톨 분노' },
  bamtol_surprised: { emoji: '📚', label: '밤톨 놀람' },
  bamtol_thinking: { emoji: '📚', label: '밤톨 고민' },
  somi_natural: { emoji: '🌸', label: '솜이 평소' },
  luru_natural: { emoji: '☕', label: '루루 평소' },
  chaka_photo_evidence: { emoji: '📷', label: '차카 야경사진' },
  missing_book_shelf: { emoji: '📚', label: '빈 선반' },
  photostudio_window: { emoji: '🖼️', label: '사진관 쇼윈도' },
  bookclub_poster: { emoji: '📝', label: '독서모임 포스터' },
  missing_book_found: { emoji: '📖', label: '선반 밑 책' },
  yami_backpack: { emoji: '🎒', label: '야미의 가방' }, // 추가: 설계 신규 증거
};

// 업로드된 이미지 저장 (key -> dataURL)
// assets.js가 먼저 로드됐다면 거기 있는 이미지들이 기본 장착됨.
// 그 후 이미지 업로드 모달로 덮어쓰거나 추가할 수 있음.
const assetRegistry = Object.assign({}, window.PRELOADED_ASSETS || {});
console.log('[assets] 초기 장착:', Object.keys(assetRegistry).length + '장');

function saveAssetToStorage() {
  try {
    // storage에 저장 (용량 때문에 skip, 메모리에만 유지)
  } catch(e) {}
}

async function loadAssetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAssetFiles(files) {
  const allSlots = [...ASSET_SLOTS.npc, ...ASSET_SLOTS.evidence];
  let matched = 0;
  for (const file of files) {
    const name = file.name.toLowerCase().replace(/\.(png|jpg|jpeg|webp)$/i, '');
    // 파일명에서 매칭 키 찾기
    const matchedKey = allSlots.find(k => name.includes(k.toLowerCase()));
    if (matchedKey) {
      try {
        const dataUrl = await loadAssetFile(file);
        assetRegistry[matchedKey] = dataUrl;
        matched++;
      } catch (e) {
        console.error('Failed to load:', file.name);
      }
    } else {
      console.warn('No match for file:', file.name);
    }
  }
  renderAssetSlots();
  showNotification(`✅ ${matched}개 이미지 등록됨 (총 ${Object.keys(assetRegistry).length}/${allSlots.length})`);
}

function renderAssetSlots() {
  const npcGrid = document.getElementById('asset-grid-npc');
  const evidGrid = document.getElementById('asset-grid-evidence');
  if (!npcGrid || !evidGrid) return;
  const makeSlot = (key) => {
    const meta = ASSET_META[key];
    const has = assetRegistry[key];
    return `<div class="asset-slot ${has ? 'has' : ''}">
      <div class="thumb">${has ? `<img src="${has}" />` : meta.emoji}</div>
      <div>${meta.label}</div>
    </div>`;
  };
  npcGrid.innerHTML = ASSET_SLOTS.npc.map(makeSlot).join('');
  evidGrid.innerHTML = ASSET_SLOTS.evidence.map(makeSlot).join('');
}

window.__openAssets = function() {
  renderAssetSlots();
  document.getElementById('asset-modal').classList.add('show');
};
window.__closeAssets = function() {
  document.getElementById('asset-modal').classList.remove('show');
};

// 드롭존 이벤트 등록 (DOM 로드 후)
setTimeout(() => {
  const dropzone = document.getElementById('asset-dropzone');
  const fileInput = document.getElementById('asset-file');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handleAssetFiles(e.target.files));
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      handleAssetFiles(e.dataTransfer.files);
    });
  }
}, 100);

// =========================================================
// 증거 팝업 시스템
// =========================================================
const collectedEvidence = new Set();

function showEvidencePopup(assetKey, context) {
  const img = assetRegistry[assetKey];
  if (!img) {
    // 이미지 없으면 notification만
    showNotification(`📸 증거 발견: ${ASSET_META[assetKey]?.label || assetKey}`);
    collectedEvidence.add(assetKey);
    return;
  }
  document.getElementById('evidence-img').src = img;
  document.getElementById('evidence-context').textContent = context || '';
  document.getElementById('evidence-modal').classList.add('show');
  collectedEvidence.add(assetKey);
}
window.__closeEvidence = function() {
  document.getElementById('evidence-modal').classList.remove('show');
};

// =========================================================
// 제타 스타일 팝업 채팅
// =========================================================
let zetaCurrentNpcId = null;

function detectEmotion(text, npcId) {
  // AI 응답에서 감정 추출 (대괄호 태그 또는 키워드)
  const tagMatch = text.match(/\[감정:([a-z]+)\]/i);
  if (tagMatch) return tagMatch[1].toLowerCase();
  
  const lower = text.toLowerCase();
  // 긍정
  if (/고마워|좋아|기쁘|행복|감사|최고|웃|하하|히히|즐거|neutral 아닌/.test(text)) return 'happy';
  // 슬픔
  if (/슬프|아파|힘들|눈물|울고|속상|미안|괴로|외로/.test(text)) return 'sad';
  // 놀람
  if (/!!|놀라|헉|어머|진짜요\?|정말\?|이럴수가|충격/.test(text)) return 'surprised';
  // 분노 (밤톨·야미)
  if (/화나|짜증|그만|싫어|용납|감히|뭐야|!!|어쩌자는/.test(text)) {
    if (npcId === 'bamtol') return 'angry';
    if (npcId === 'yami') return 'angry';
  }
  // 고민 (차카 전용)
  if (npcId === 'chaka' && /음\.\.|글쎄|아무래도|잘 모르|고민/.test(text)) return 'thinking';
  
  return 'natural';
}

function getPortraitKey(npcId, emotion) {
  // 이제 npcId가 이미 chaka/yami/bamtol/somi/luru 형태이므로 prefix 제거 불필요
  const key = `${npcId}_${emotion}`;
  if (assetRegistry[key]) return key;
  // 폴백: natural
  const fallback = `${npcId}_natural`;
  return assetRegistry[fallback] ? fallback : null;
}

function setZetaPortrait(npcId, emotion) {
  const imgEl = document.getElementById('zeta-portrait');
  const areaEl = document.getElementById('zeta-portrait-area');
  // 포트레이트 영역이 제거됐으면 아무것도 안 함 (레거시 호출 대응)
  if (!imgEl || !areaEl) return;
  const key = getPortraitKey(npcId, emotion);
  if (!key) {
    imgEl.classList.remove('show');
    imgEl.src = '';
    areaEl.style.background = 'linear-gradient(135deg, #fef3e7, #fde8ec)';
    return;
  }
  const current = imgEl.src;
  const newSrc = assetRegistry[key];
  if (current === newSrc) return;
  imgEl.classList.remove('show');
  setTimeout(() => {
    imgEl.src = newSrc;
    imgEl.onload = () => imgEl.classList.add('show');
  }, 150);
}

// 메시지 위에 인라인 감정 이미지 추가
function appendInlineEmotionCard(npcId, emotion, messagesEl) {
  const key = getPortraitKey(npcId, emotion);
  if (!key || !assetRegistry[key]) return null;
  
  const card = document.createElement('div');
  card.className = 'zeta-emotion-card';
  const img = document.createElement('img');
  img.src = assetRegistry[key];
  img.alt = emotion;
  card.appendChild(img);
  messagesEl.appendChild(card);
  return card;
}

function openZeta(npcId) {
  const npc = state.npcs.find(n => n.id === npcId);
  if (!npc) return;
  zetaCurrentNpcId = npcId;
  state.selectedNpcId = npcId;
  
  document.getElementById('zeta-name').textContent = `${npc.emoji} ${npc.name}`;
  document.getElementById('zeta-sub').textContent = `${npc.job} · ${npc.personality}`;
  document.getElementById('zeta-affinity').textContent = npc.affinity;
  
  // 기존 대화 이력 표시
  const messagesEl = document.getElementById('zeta-messages');
  messagesEl.innerHTML = '';
  let history = state.chatHistory[npcId] || [];
  
  // 첫 만남이면 NPC가 먼저 인사 (natural 감정)
  if (history.length === 0) {
    const sys = document.createElement('div');
    sys.className = 'zeta-msg system';
    sys.textContent = `${npc.name}와의 첫 만남`;
    messagesEl.appendChild(sys);
    
    // NPC별 첫 인사말 (말버릇 섞어서)
    const greetings = {
      'chaka': '어... 안녕하세요. 처음 뵙는 것 같네요.',
      'yami': '안녕! 너도 책 좋아하지?',
      'bamtol': '어서 오는군. 뭐 찾는 책이라도 있는군?',
      'luru': '어서 오세요! 오늘은 뭐 마실래요?',
      'somi': '안녕~ 오늘 동네 소식 들었음~?',
    };
    const greeting = greetings[npcId] || `안녕! 반가워${npc.speechHabit || ''}`;
    
    // 인사말을 히스토리에 추가 (서버에 저장, 이후 대화 맥락으로 쓰임)
    history = [{ role: 'npc', text: greeting, emotion: 'natural' }];
    state.chatHistory[npcId] = history;
  }
  
  // 히스토리 렌더링 — NPC 감정이 바뀌는 지점에 이미지 카드 삽입
  let prevEmotion = null;
  history.forEach(m => {
    if (m.role === 'npc') {
      const emotion = m.emotion || detectEmotion(m.text, npcId);
      if (emotion !== prevEmotion) {
        appendInlineEmotionCard(npcId, emotion, messagesEl);
        prevEmotion = emotion;
      }
    }
    const msg = document.createElement('div');
    msg.className = `zeta-msg ${m.role}`;
    msg.textContent = m.role === 'user' ? m.text : `${m.text}`;
    messagesEl.appendChild(msg);
  });
  // 마지막 감정 상태 저장 (새 대화에서 비교용)
  if (prevEmotion) state.chatHistory[`_emotion_${npcId}`] = prevEmotion;
  
  document.getElementById('zeta-chat').classList.add('show');
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    document.getElementById('zeta-input').focus();
  }, 300);
}

window.__closeZeta = function() {
  // [9단계] 대화창 닫을 때 마일스톤 판정 호출.
  // 엔진이 활성 스토리 퀘스트가 있는지, 이 NPC 로 달성 가능한 마일스톤이 있는지,
  // 유저 발화가 있는지 전부 체크하고 없으면 조용히 스킵한다.
  // AI 호출은 비동기지만 여기선 await 하지 않음 (창 닫기 UX 를 막지 않기 위해).
  // 결과(배너 갱신/퀘스트 해결)는 비동기로 처리됨.
  const closingNpcId = zetaCurrentNpcId;
  const closingHistory = closingNpcId ? (state.chatHistory[closingNpcId] || []).slice() : [];

  document.getElementById('zeta-chat').classList.remove('show');
  zetaCurrentNpcId = null;

  if (closingNpcId && closingHistory.length > 0
      && window.scenarioEngine
      && typeof window.scenarioEngine.evaluateQuestMilestones === 'function') {
    // fire-and-forget. 판정 끝나면 배너 갱신 트리거.
    window.scenarioEngine.evaluateQuestMilestones(closingNpcId, closingHistory)
      .then(function (result) {
        if (result && result.newlyAchievedDetails && result.newlyAchievedDetails.length > 0) {
          console.log('[state] 마일스톤 달성:', result.newlyAchieved);
          // [9단계] 구체적 알림 — 어떤 마일스톤이 달성됐는지 명시.
          // 여러 개 동시 달성되면 순차 표시 (각각 3.5초).
          result.newlyAchievedDetails.forEach(function (m, i) {
            setTimeout(function () {
              showNotification('✨ 달성: ' + m.description);
            }, i * 3500);
          });
        }
        // 배너 갱신 (정의돼 있으면)
        if (typeof renderQuestBanner === 'function') {
          try { renderQuestBanner(); } catch (e) { /* ignore */ }
        }
        // 퀘스트 해결됐으면 UI 전반 갱신
        if (result && result.resolved) {
          if (typeof renderContent === 'function') { try { renderContent(); } catch(e){} }
          if (typeof renderCounts === 'function')  { try { renderCounts(); } catch(e){} }
        }
      })
      .catch(function (err) {
        console.error('[state] evaluateQuestMilestones 실패 (무시):', err);
      });
  }

  // [9.5단계] 장기 메모리 요약 — 임계치 초과 시 fire-and-forget.
  // 마일스톤 판정과 병렬로 진행. 실패해도 다음 대화창 닫을 때 재시도.
  if (closingNpcId) {
    try {
      summarizeOldHistory(closingNpcId);
    } catch (err) {
      console.warn('[memory] summarize trigger 에러 (무시):', err);
    }
  }

  // [9.5단계] 상태 저장 (대화 종료 시점에 스냅샷)
  try { persistState && persistState(); } catch(e) {}
};

window.__zetaSend = async function() {
  const input = document.getElementById('zeta-input');
  const text = input.value.trim();
  console.log('[zetaSend] clicked', { text, zetaCurrentNpcId, loading: state.loading });
  if (!text || !zetaCurrentNpcId || state.loading) {
    console.warn('[zetaSend] aborted', { reason: !text ? 'no text' : !zetaCurrentNpcId ? 'no npc' : 'loading' });
    return;
  }
  input.value = '';
  
  const npc = state.npcs.find(n => n.id === zetaCurrentNpcId);
  const npcId = npc.id;
  const messagesEl = document.getElementById('zeta-messages');
  
  // 유저 메시지 추가
  const userMsg = document.createElement('div');
  userMsg.className = 'zeta-msg user';
  userMsg.textContent = text;
  messagesEl.appendChild(userMsg);
  
  const history = state.chatHistory[npcId] || [];
  history.push({ role: 'user', text });
  state.chatHistory[npcId] = history;
  
  // 타이핑 인디케이터
  const typing = document.createElement('div');
  typing.className = 'zeta-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  try {
    state.loading = true;
    // [8단계 제거] NPC별 storyStage 기반 하드코딩 storyContext 블록 삭제.
    //              엔진의 getDialogueContext 가 전담 (아래 systemFinal 조립부).
    // 감정 태그 지시사항만 isStory NPC 대상으로 유지 (이건 대화 포맷 규칙이라 엔진 밖에 있어야 맞음).
    const emotionDirective = npc.isStory
      ? '\n\n답변 시작 또는 끝에 [감정:natural|happy|sad|surprised|angry|thinking] 태그를 붙여서 네 현재 감정을 표현해. 예: "그건 말이지... [감정:angry]"'
      : '';

    const system = `너는 아기자기한 동네 게임의 NPC다. 캐주얼하고 자연스러운 톤으로 짧게 대답해.

너의 정보:
- 이름: ${npc.name}
- 직업: ${npc.job}
- 꿈: ${npc.dream} (${npc.dreamProgress}%)
- 성격: ${npc.personality}
- 말버릇: "${npc.speechHabit}" (자주 섞어)
- 호감도: ${npc.affinity}/100

규칙:
- 1-2문장만
- 말버릇을 자주 붙여
- 호감도 낮으면 거리감 있게, 높으면 친근하게${emotionDirective}

최근 동네 소문: ${state.rumors.slice(-3).map(r => r.text).join(' / ') || '없음'}`;

    // [7단계] 엔진 배경 concat. [8단계] 하드코딩 제거로 엔진이 storyContext 전담.
    let engineContext = '';
    try {
      if (window.scenarioEngine && typeof window.scenarioEngine.getDialogueContext === 'function') {
        engineContext = window.scenarioEngine.getDialogueContext(npcId) || '';
      }
    } catch (err) {
      console.error('[zetaSend] getDialogueContext 에러 (무시):', err);
    }
    // [9.5단계] 장기 메모리 주입
    const memorySection = buildLongTermMemorySection(npcId);
    const systemFinal = system + engineContext + memorySection;
    
    // history를 OpenAI messages 배열로 변환
    // user는 그대로, npc는 assistant로 매핑
    const messagesArr = history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const rawResponse = await callClaude(systemFinal, messagesArr);
    
    // 감정 태그 제거한 깨끗한 응답
    const cleanResponse = rawResponse.replace(/\[감정:[a-z]+\]/gi, '').trim();
    const emotion = detectEmotion(rawResponse, npcId);
    
    // 타이핑 제거
    typing.remove();
    
    // 감정 이미지 — 이전 NPC 감정과 다를 때만 표시 (첫 메시지 포함)
    const lastEmotion = state.chatHistory[`_emotion_${npcId}`] || null;
    if (emotion !== lastEmotion) {
      appendInlineEmotionCard(npcId, emotion, messagesEl);
      state.chatHistory[`_emotion_${npcId}`] = emotion;
    }
    
    // NPC 답변 추가
    const npcMsg = document.createElement('div');
    npcMsg.className = 'zeta-msg npc';
    npcMsg.textContent = cleanResponse;
    messagesEl.appendChild(npcMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    history.push({ role: 'npc', text: cleanResponse, emotion });
    state.chatHistory[npcId] = history;
    
    // 호감도/꿈 진행도 소폭 증가
    npc.affinity = Math.min(100, npc.affinity + 3);
    npc.dreamProgress = Math.min(100, npc.dreamProgress + 2);
    document.getElementById('zeta-affinity').textContent = npc.affinity;
    
    renderNpcList();

    // [8단계 제거] 키워드 기반 증거 자동 팝업 블록 3개 삭제.
    // 사유: 엔진의 낮 이벤트 (handleNpcApproach → showEvidencePopup effect) 가
    //       동일 기능을 시나리오 데이터 기반으로 제공. 두 시스템이 동시에 팝업을
    //       띄우면 UI 큐에 중복 enqueue 되어 혼란. 엔진 쪽으로 일원화.
  } catch (err) {
    console.error('[zetaSend] error', err);
    try { typing.remove(); } catch(e) {}
    const errMsg = document.createElement('div');
    errMsg.className = 'zeta-msg system';
    errMsg.textContent = '오류가 발생했어요: ' + (err.message || err);
    messagesEl.appendChild(errMsg);
  } finally {
    state.loading = false;
  }
};

// Enter 키 전송
setTimeout(() => {
  const input = document.getElementById('zeta-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.__zetaSend(); }
    });
  }
}, 100);
function setLoading(flag, msg = '불러오는 중...') {
  state.loading = flag;
  const overlay = document.getElementById('loading-overlay');
  document.getElementById('loading-msg').textContent = msg;
  if (flag) overlay.classList.add('show');
  else overlay.classList.remove('show');
}

// =========================================================
// [9.5단계] 장기 메모리 — 오래된 대화 요약
// =========================================================
// 파라미터 (20/15/5):
//   - history 길이가 HISTORY_THRESHOLD(20) 넘으면 요약 트리거
//   - 오래된 SUMMARIZE_CHUNK(15) 턴을 요약하고 chatHistory 에서 제거
//   - 최근 RECENT_KEEP(5) 턴은 원문 유지
// 요약은 누적: 기존 summary 가 있으면 "기존 요약 + 이번 15턴" 을 합쳐 새 요약 생성.
// 실패해도 게임엔 영향 없음 — 기존 상태 그대로 유지.
//
// 호출 시점: __closeZeta 에서 fire-and-forget 비동기로 시작.
//           유저가 다음 대화 열 때쯤엔 대부분 완료됨.

const MEM_HISTORY_THRESHOLD = 20;
const MEM_SUMMARIZE_CHUNK   = 15;
const MEM_RECENT_KEEP       = 5;

async function summarizeOldHistory(npcId) {
  if (!npcId) return;
  const history = state.chatHistory[npcId];
  if (!Array.isArray(history) || history.length < MEM_HISTORY_THRESHOLD) return;
  if (typeof callClaude !== 'function') return;

  const npc = state.npcs.find(n => n.id === npcId);
  if (!npc) return;

  // 오래된 15턴을 뜯어냄
  const oldChunk = history.slice(0, MEM_SUMMARIZE_CHUNK);
  const convoStr = oldChunk.map(m => {
    const who = m.role === 'user' ? '유저' : npc.name;
    return who + ': ' + m.text;
  }).join('\n');

  const prevSummary = state.longTermSummary[npcId] || '';

  const systemPrompt =
    '너는 게임 대화 요약기다. 유저와 NPC의 대화 내역을 핵심만 남겨 간결한 한국어로 요약한다.\n' +
    '규칙:\n' +
    '1. 유저의 질문/선언/약속, NPC의 감정 반응, 두 사람이 합의한 사실을 보존한다.\n' +
    '2. 단순 인사, 농담, 잡담은 생략한다.\n' +
    '3. NPC가 비밀이나 속마음을 털어놓은 적이 있으면 반드시 포함한다.\n' +
    '4. 감정적 뉘앙스(화남, 슬픔, 기쁨, 경계 등)는 간단히 한 단어로 병기한다.\n' +
    '5. 서사 스포일러(예: 시나리오 진실)에 해당하는 부분이 대화에 등장했으면 "~~에 관한 얘기가 오갔다" 식으로 추상화 — 구체 내용은 누락해도 됨.\n' +
    '6. 결과는 3~6문장의 자연스러운 한 단락으로. 불릿 금지.';

  const userPromptParts = [];
  if (prevSummary) {
    userPromptParts.push('이전까지의 대화 요약:\n' + prevSummary);
  }
  userPromptParts.push('이번에 요약할 새 대화:\n' + convoStr);
  userPromptParts.push('위 정보를 합쳐, 지금까지의 전체 대화에 대한 새 누적 요약을 위 규칙대로 작성해줘.');

  try {
    console.log('[memory] summarizing', npcId, 'old turns=' + oldChunk.length);
    const newSummary = await callClaude(systemPrompt, userPromptParts.join('\n\n'), false, { temperature: 0.3 });
    if (newSummary && newSummary.trim()) {
      state.longTermSummary[npcId] = newSummary.trim();
      // 요약 완료됐으니 chatHistory 에서 오래된 부분 삭제
      state.chatHistory[npcId] = history.slice(MEM_SUMMARIZE_CHUNK);
      console.log('[memory] summary updated for', npcId, '(history now', state.chatHistory[npcId].length + ' turns)');
      // 저장소에도 반영
      try { persistState && persistState(); } catch(e) {}
    }
  } catch (err) {
    console.warn('[memory] summary failed (무시, 다음 기회에 재시도):', err);
  }
}

// 대화 프롬프트에 붙일 "장기 메모리 섹션" 조립. 요약 없으면 빈 문자열.
function buildLongTermMemorySection(npcId) {
  const s = state.longTermSummary[npcId];
  if (!s) return '';
  return '\n\n[지금까지 유저와 나눴던 대화 요약 (기억)]\n' + s;
}



// [9단계 수정] 4번째 인자 options 추가. { temperature: 0~2 } 형태.
//   temperature 미지정 시 서버(api/chat.js)의 기본값 0.85 유지.
//   판정처럼 일관성이 중요한 호출은 낮은 값(예: 0.2) 전달.
async function callClaude(systemPrompt, userPromptOrMessages, expectJSON = false, options) {
  try {
    console.log('[callClaude] start', expectJSON ? 'JSON' : 'text', options && options.temperature !== undefined ? '(temp=' + options.temperature + ')' : '');
    // Vercel 서버리스 함수 경유 (API 키는 서버 환경변수에 보관)
    const body = {
      system: systemPrompt,
      max_tokens: 1000,
    };
    if (options && typeof options.temperature === 'number') {
      body.temperature = options.temperature;
    }
    if (Array.isArray(userPromptOrMessages)) {
      body.messages = userPromptOrMessages;
    } else {
      body.user = userPromptOrMessages;
    }
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('[callClaude] HTTP error:', response.status, errText);
      throw new Error('API HTTP ' + response.status + ': ' + errText);
    }
    const data = await response.json();
    console.log('[callClaude] got response');
    const text = data.text || '';
    if (expectJSON) {
      const clean = text.replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      const jsonStr = match ? match[0] : clean;
      try {
        return JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('[callClaude] JSON parse error, raw text:', text);
        throw new Error('JSON parse failed');
      }
    }
    return text.trim();
  } catch (err) {
    console.error('[callClaude] error:', err);
    throw err;
  }
}

// =========================================================

// =========================================================
// [9.5단계] sessionStorage 영속화
// =========================================================
// 범위: 한 탭(브라우저 세션) 내에서만 유지. 탭 닫으면 자동 삭제.
// 즉 F5 새로고침엔 살아남고, 탭/창 닫으면 사라짐 — 요구사항에 정확히 부합.
//
// 저장 대상:
//   - 게임 상태: day, npcs(동적 필드만), chatHistory, longTermSummary,
//               rumors, reports, quests
//   - 엔진 상태: currentStage, sleepCount, completedEvents, resolvedQuests,
//               flags, injectedContext, seedReports, questMilestones
//
// ⚠️ Set 객체는 JSON 직렬화 안 됨 → 저장 시 Array 로 변환, 복구 시 Set 으로 역변환.
// ⚠️ 스키마 바뀌면 구버전 저장본은 폐기 → PERSIST_VERSION 으로 관리.
//
// 디버그: 콘솔에서 window.__resetSession() 호출하면 저장본 삭제 + 새로고침.

const PERSIST_KEY     = 'talking-island-session';
const PERSIST_VERSION = 1;

function persistState() {
  try {
    if (!state || !state.npcs) return;

    // 엔진 상태 뽑아오기 (Set 은 Array 로)
    let engineSnapshot = null;
    if (window.scenarioEngine && window.scenarioEngine.state) {
      const es = window.scenarioEngine.state;
      const questMilestonesObj = {};
      if (es.questMilestones) {
        for (const [qid, setVal] of Object.entries(es.questMilestones)) {
          questMilestonesObj[qid] = Array.from(setVal || []);
        }
      }
      engineSnapshot = {
        currentStage:    es.currentStage,
        sleepCount:      es.sleepCount,
        completedEvents: Array.from(es.completedEvents || []),
        resolvedQuests:  Array.from(es.resolvedQuests  || []),
        flags:           es.flags || {},
        injectedContext: es.injectedContext || {},
        seedReports:     es.seedReports || {},
        questMilestones: questMilestonesObj,
      };
    }

    const snapshot = {
      version: PERSIST_VERSION,
      savedAt: Date.now(),
      game: {
        day: state.day,
        phase: state.phase,
        timeOfDay: state.timeOfDay,
        storyOpeningShown: state.storyOpeningShown,
        // NPC 는 id + 동적 필드만 저장 (정적 데이터는 data.js 원본 사용)
        npcs: state.npcs.map(n => ({
          id: n.id, affinity: n.affinity, dreamProgress: n.dreamProgress, level: n.level,
        })),
        chatHistory: state.chatHistory || {},
        longTermSummary: state.longTermSummary || {},
        rumors: state.rumors || [],
        reports: state.reports || [],
        quests: state.quests || [],
      },
      engine: engineSnapshot,
    };
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[persist] 저장 실패 (무시):', err);
  }
}

// 페이지 로드 시 호출. 반환값: true=복구 성공, false=복구 안 함(fresh 시작)
function restoreState() {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);

    if (!snap || snap.version !== PERSIST_VERSION) {
      console.warn('[persist] 버전 불일치로 저장본 폐기. saved=', snap && snap.version, ' current=', PERSIST_VERSION);
      sessionStorage.removeItem(PERSIST_KEY);
      return false;
    }

    // 게임 상태 복구
    const g = snap.game || {};
    state.day       = g.day       !== undefined ? g.day       : state.day;
    state.phase     = g.phase     || state.phase;
    state.timeOfDay = g.timeOfDay !== undefined ? g.timeOfDay : state.timeOfDay;
    state.storyOpeningShown = !!g.storyOpeningShown;

    // NPC: id 로 매칭해서 동적 필드 덮어쓰기 (정적 필드는 data.js 원본 유지)
    if (Array.isArray(g.npcs) && state.npcs.length > 0) {
      const saved = {};
      g.npcs.forEach(n => { saved[n.id] = n; });
      state.npcs.forEach(n => {
        if (saved[n.id]) {
          n.affinity      = saved[n.id].affinity      ?? n.affinity;
          n.dreamProgress = saved[n.id].dreamProgress ?? n.dreamProgress;
          n.level         = saved[n.id].level         ?? n.level;
        }
      });
    }
    state.chatHistory     = g.chatHistory     || {};
    state.longTermSummary = g.longTermSummary || {};
    state.rumors          = g.rumors          || [];
    state.reports         = g.reports         || [];
    state.quests          = g.quests          || [];

    // 엔진 상태 복구 (엔진이 먼저 로드·초기화돼 있어야 함 — 스크립트 순서 보장됨)
    if (snap.engine && window.scenarioEngine && window.scenarioEngine.state) {
      const es = window.scenarioEngine.state;
      const e  = snap.engine;
      if (e.currentStage)                es.currentStage = e.currentStage;
      if (typeof e.sleepCount === 'number') es.sleepCount  = e.sleepCount;
      es.completedEvents = new Set(Array.isArray(e.completedEvents) ? e.completedEvents : []);
      es.resolvedQuests  = new Set(Array.isArray(e.resolvedQuests)  ? e.resolvedQuests  : []);
      es.flags           = e.flags || {};
      es.injectedContext = e.injectedContext || {};
      es.seedReports     = e.seedReports || {};
      es.questMilestones = {};
      if (e.questMilestones && typeof e.questMilestones === 'object') {
        for (const [qid, arr] of Object.entries(e.questMilestones)) {
          es.questMilestones[qid] = new Set(Array.isArray(arr) ? arr : []);
        }
      }
      // 복구 후 activeEvents 재계산 (completedEvents + currentStage 기준)
      try { window.scenarioEngine.manageActiveEvents(); } catch(e) {}
    }

    console.log('[persist] 복구 완료. day=' + state.day +
                ', stage=' + (window.scenarioEngine && window.scenarioEngine.currentStage) +
                ', savedAt=' + new Date(snap.savedAt).toLocaleTimeString());
    return true;
  } catch (err) {
    console.error('[persist] 복구 실패, 저장본 폐기:', err);
    try { sessionStorage.removeItem(PERSIST_KEY); } catch(e) {}
    return false;
  }
}

// 디버그: 콘솔에서 window.__resetSession() 호출하면 저장본 삭제 + 새로고침
window.__resetSession = function () {
  try { sessionStorage.removeItem(PERSIST_KEY); } catch(e) {}
  console.log('[persist] 세션 리셋. 새로고침합니다...');
  location.reload();
};
