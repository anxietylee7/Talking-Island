function buildDrawSequence() {
  // STORY_NPCS 5명의 순서를 섞기만 함 (누가 먼저 뽑힐지는 랜덤)
  return [...STORY_NPCS].sort(() => Math.random() - 0.5);
}

// [9.5단계] sessionStorage 복구 시도.
// state.js 와 scenarioEngine.js 가 이미 로드된 후(script 순서상 그렇다) 호출된다.
// 복구 성공 시: state.npcs 가 채워짐 + 엔진 상태 세팅됨 → 가챠 스킵하고 바로 마을 진입.
// 주의: 인트로 가챠가 시작되기 전에 호출돼야 한다.
function tryRestoreSessionOnLoad() {
  if (typeof restoreState !== 'function') return false;
  // STORY_NPCS 를 먼저 state.npcs 에 채워야 restoreState 가 id 매칭으로 필드 덮어쓸 수 있다.
  // (restoreState 는 state.npcs 가 비어있으면 NPC 동적 필드 복구를 건너뜀)
  if (state.npcs.length === 0) {
    STORY_NPCS.forEach(tpl => {
      state.npcs.push({ ...tpl, location: tpl.homeLocation || 'outside' });
    });
  }
  const restored = restoreState();
  if (!restored) {
    // 복구 실패 → 가챠부터 시작. state.npcs 비워서 원래 흐름으로.
    state.npcs = [];
    return false;
  }
  return true;
}

window.__introRollGacha = async function() {
  console.log('[intro] gacha clicked, index:', introDrawIndex);
  const btn = document.getElementById('intro-gacha-btn');
  const loading = document.getElementById('intro-loading');
  const capsule = document.getElementById('gacha-capsule');
  const result = document.getElementById('gacha-result');
  const actions = document.getElementById('gacha-result-actions');
  
  if (!introDrawSequence) {
    // 첫 가챠 시작 시 상태 완전 리셋
    state.npcs = [];
    introDrawIndex = 0;
    introDrawSequence = buildDrawSequence();
    console.log('[intro] sequence built:', introDrawSequence.map(n => n.name).join(','));
    // [추가] 이전 시도에서 남은 부유 공 초기화 (가챠 다시 시도 케이스).
    document.querySelectorAll('.intro-particles .npc-floating').forEach(b => b.remove());
    document.querySelectorAll('.gacha-dot').forEach(d => d.classList.remove('filled'));
  }
  
  btn.disabled = true;
  btn.style.display = 'none';
  loading.classList.add('show');
  loading.style.display = 'flex';
  
  // 캡슐 상태 리셋
  capsule.classList.remove('popped', 'rolling', 'rolling-soft', 'rolling-medium', 'rolling-strong', 'final-glow');
  capsule.textContent = '🎁';
  capsule.querySelectorAll('.gacha-sparkle').forEach(s => s.remove());
  // 이전 5번째 스포트라이트 제거
  document.body.classList.remove('gacha-final-spotlight');
  result.classList.remove('show');
  result.style.display = 'none';
  
  // [가챠 추천 조합 #1] 떨림 강도 점진적 증가 — soft → medium → strong
  //   각 단계는 약 350~450ms씩, 마지막 strong 에서 캡슐이 터지기 직전 격렬해짐.
  capsule.classList.add('rolling-soft');
  
  try {
    // 떨림 단계 전환 — 총 약 1.2초 후 결과
    setTimeout(() => {
      capsule.classList.remove('rolling-soft');
      capsule.classList.add('rolling-medium');
    }, 400);
    setTimeout(() => {
      capsule.classList.remove('rolling-medium');
      capsule.classList.add('rolling-strong');
    }, 800);
    
    // 연출용 딜레이 (1.1~1.3초) — 떨림 단계 전부 통과
    const delay = 1100 + Math.random() * 200;
    await new Promise(r => setTimeout(r, delay));
    
    const npcTemplate = introDrawSequence[introDrawIndex];
    const newNpc = { 
      ...npcTemplate, 
      location: npcTemplate.homeLocation || 'outside',
    };
    state.npcs.push(newNpc);
    introDrawIndex++;
    const isFinal = (introDrawIndex === 5);
    
    console.log('[intro] drew:', newNpc.name, isFinal ? '(FINAL)' : '');
    
    // 진행도 업데이트
    document.getElementById('gacha-count').textContent = introDrawIndex;
    // [옵션 C] 진행도 도트 — 채워진 만큼 .filled 클래스 부여 (CSS 가 처리).
    document.querySelectorAll('.gacha-dot').forEach(function (dot, i) {
      if (i < introDrawIndex) dot.classList.add('filled');
      else dot.classList.remove('filled');
    });

    // [추가] 뽑힌 NPC 를 인트로 배경에 떠다니는 공으로 추가 — 꽃잎 입자처럼.
    //   가챠 카드와는 별개로, 카드를 닫은 뒤에도 화면에 남아 있음.
    //   5명 다 뽑으면 5개의 공이 부유. 마을 입장 시 인트로 페이드아웃과 함께 사라짐.
    //   위치: 미리 정의한 슬롯 5개 중 introDrawIndex 번째 사용 (균등 배치).
    const particles = document.querySelector('.intro-particles');
    if (particles) {
      // 슬롯 좌표 — 화면 4모서리 + 중앙 위쪽. 카드 영역(중앙) 피함.
      const slots = [
        { x: '12%', y: '20%', d: '0.0s', r: '9s' },
        { x: '85%', y: '24%', d: '0.4s', r: '10s' },
        { x: '15%', y: '70%', d: '0.2s', r: '8.5s' },
        { x: '88%', y: '66%', d: '0.6s', r: '9.5s' },
        { x: '50%', y: '15%', d: '0.3s', r: '10s' },
      ];
      const slot = slots[(introDrawIndex - 1) % slots.length];
      const ball = document.createElement('div');
      ball.className = 'npc-floating';
      ball.style.setProperty('--x', slot.x);
      ball.style.setProperty('--y', slot.y);
      ball.style.setProperty('--d', slot.d);
      ball.style.setProperty('--r', slot.r);
      // 이미지 있으면 이미지, 없으면 이모지
      const naturalKey2 = `${newNpc.id}_natural`;
      const naturalImg2 = (window.PRELOADED_ASSETS || {})[naturalKey2];
      if (naturalImg2) {
        ball.innerHTML = `<img src="${naturalImg2}" alt="${newNpc.name}" />`;
      } else {
        ball.textContent = newNpc.emoji || '🙂';
      }
      particles.appendChild(ball);
    }
    
    // [가챠 5번째 특수] 5번째면 화면 어둡게 + 캡슐 글로우
    if (isFinal) {
      document.body.classList.add('gacha-final-spotlight');
      capsule.classList.add('final-glow');
    }
    
    // 떨림 클래스 전부 제거 후 pop
    capsule.classList.remove('rolling', 'rolling-soft', 'rolling-medium', 'rolling-strong');
    capsule.classList.add('popped');
    
    // UI 갱신 — 캡슐에 natural 이미지 표시 (없으면 이모지 폴백)
    const naturalKey = `${newNpc.id}_natural`;
    const naturalImg = (window.PRELOADED_ASSETS || {})[naturalKey];
    if (naturalImg) {
      capsule.innerHTML = `<img src="${naturalImg}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="${newNpc.name}" />`;
    } else {
      capsule.textContent = newNpc.emoji;
    }
    loading.classList.remove('show');
    loading.style.display = 'none';
    
    // [가챠 추천 조합 #2] 꽃잎/별/하트 흩날림 — 14개, 더 멀리 (5번째는 18개)
    //   동네 톤에 어울리는 이모지 혼합. 각도 균등 분포 + 약간의 랜덤성.
    const particleCount = isFinal ? 18 : 14;
    const particleEmojis = ['🌸', '🌼', '✨', '⭐', '💛', '🍃', '🌷', '💫'];
    for (let i = 0; i < particleCount; i++) {
      const s = document.createElement('div');
      s.className = 'gacha-sparkle';
      s.textContent = particleEmojis[i % particleEmojis.length];
      // 각도: 균등 분포 + 약간의 랜덤
      const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      // 거리: 100~140px (5번째는 130~170px 더 멀리)
      const dist = isFinal ? (130 + Math.random() * 40) : (100 + Math.random() * 40);
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.animationDelay = (i * 0.04) + 's';
      capsule.appendChild(s);
    }
    
    // [가챠 추천 조합 #3] 이름 타이핑 — 한 글자씩 통통 등장
    const nameEl = document.getElementById('result-name');
    nameEl.innerHTML = '';
    const chars = Array.from(newNpc.name);
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'gacha-name-char';
      span.textContent = ch;
      span.style.animationDelay = (0.4 + i * 0.08) + 's';
      nameEl.appendChild(span);
    });
    
    // 카드 나머지 정보
    document.getElementById('result-species').textContent = newNpc.trait;
    document.getElementById('result-job').textContent = newNpc.job;
    document.getElementById('result-dream').textContent = newNpc.dream || '—';
    document.getElementById('result-personality').textContent = newNpc.personality;
    document.getElementById('result-speech').textContent = newNpc.speechHabit ? `"${newNpc.speechHabit}"` : '—';
    
    // [가챠 추천 조합 #4] 별점 카운트업 — NPC.level 만큼 ★ 채움 (최대 3개 가정)
    //   기존 species 표시(.result-species) 옆에 별점 inline 추가.
    //   .gacha-stars 컨테이너를 찾거나 생성.
    const starsHost = document.getElementById('gacha-stars-host');
    if (starsHost) {
      const total = 3;
      const filled = Math.max(1, Math.min(total, newNpc.level || 1));
      starsHost.innerHTML = '';
      const wrap = document.createElement('span');
      wrap.className = 'gacha-stars';
      for (let i = 0; i < total; i++) {
        const star = document.createElement('span');
        star.className = 'gacha-star';
        star.textContent = '★';
        wrap.appendChild(star);
      }
      starsHost.appendChild(wrap);
      // 0.6초부터 시작해 100ms 간격으로 하나씩 채우기 (이름 타이핑 끝난 직후)
      const startDelay = 600 + chars.length * 80;
      const stars = wrap.querySelectorAll('.gacha-star');
      for (let i = 0; i < filled; i++) {
        setTimeout(() => {
          stars[i].classList.add('filled');
        }, startDelay + i * 130);
      }
    }
    
    // 액션 버튼
    if (introDrawIndex < 5) {
      actions.innerHTML = `<button class="story-modal-close" style="margin-top:0" onclick="window.__introRollGacha()">🎲 다음 주민 뽑기 (${introDrawIndex}/5)</button>`;
    } else {
      actions.innerHTML = `<button class="story-modal-close" style="margin-top:0; background: linear-gradient(135deg, #7c94c7 0%, #9d7cc7 100%)" onclick="window.__enterVillage()">🌿 마을로 입장하기</button>`;
    }
    
    setTimeout(() => {
      result.classList.add('show');
      result.style.display = 'block';
    }, 400);
  } catch (err) {
    console.error('[intro] fatal error:', err);
    loading.classList.remove('show');
    loading.style.display = 'none';
    capsule.classList.remove('rolling', 'rolling-soft', 'rolling-medium', 'rolling-strong', 'final-glow');
    document.body.classList.remove('gacha-final-spotlight');
    btn.disabled = false;
    btn.style.display = 'inline-block';
    btn.textContent = '🎲 다시 시도';
    showNotification('❌ 오류: ' + (err.message || '알 수 없는 오류'));
  }
};

window.__enterVillage = async function() {
  console.log('[intro] enter village clicked, npc count:', state.npcs.length);
  
  // [버그 수정] 5번째 가챠에서 추가된 .gacha-final-spotlight 클래스가 body 에 남아 있으면
  // 마을 진입 후에도 화면 주변이 어둡게 깔림. 인트로 종료 시점에 강제 제거.
  document.body.classList.remove('gacha-final-spotlight');
  
  // 🔧 먼저 GLB 모델 프리로드 (로딩 UI 표시)
  const actions = document.getElementById('gacha-result-actions');
  const loading = document.getElementById('intro-loading');
  if (actions) actions.innerHTML = '';  // "마을로 입장하기" 버튼 숨김
  if (loading) {
    loading.classList.add('show');
    loading.style.display = 'flex';
    const loadingText = loading.querySelector('span');
    if (loadingText) loadingText.textContent = '캐릭터 모델을 불러오는 중... (0/6)';
  }
  
  try {
    if (window.__preloadAllGltfModels) {
      await window.__preloadAllGltfModels((loaded, total, name) => {
        if (loading) {
          const loadingText = loading.querySelector('span');
          if (loadingText) loadingText.textContent = `캐릭터 모델을 불러오는 중... (${loaded}/${total})`;
        }
      });
    }
  } catch (err) {
    console.error('[intro] preload error:', err);
    // 프리로드 실패해도 진행 (프리미티브로 폴백)
  }
  
  if (loading) {
    loading.classList.remove('show');
    loading.style.display = 'none';
  }
  
  // 🔧 이제 인트로 페이드 아웃 + 마을 진입
  const intro = document.getElementById('intro-screen');
  intro.classList.add('fade-out');
  setTimeout(() => {
    intro.style.display = 'none';
    
    // state.npcs에는 이미 인트로에서 뽑은 시나리오 NPC 5명이 있음
    // 중복 스폰 방지 (혹시 이미 메시가 있으면 스킵)
    state.npcs.forEach(npc => {
      if (!npcMeshes[npc.id]) spawnNpcMesh(npc);
    });
    // 유저 아바타 스폰 (광장 중앙)
    spawnUserMesh();
    
    renderNpcList();
    renderCounts();
    
    // 마을 진입 후 환영 메시지 (페이드 아웃 끝난 뒤 여유 있게 1.2초)
    setTimeout(() => {
      showStoryModal(
        '🏘️ 동네에 오신 걸 환영해요',
        '5명의 주민이 이미 이곳에 살고 있어요.\n\n🧑 광장 중앙에 있는 게 당신이에요.\n• 바닥을 클릭하면 그쪽으로 이동합니다.\n• 주민을 클릭하면 가까이 다가가서 대화해요.\n• 집(북쪽)의 침대를 클릭하면 잠들 수 있어요.\n\n편하게 인사하며 동네를 둘러보세요.'
      );
    }, 1200);
  }, 800);
};

// 버튼 이벤트 등록 (안전하게)
function attach(id, event, fn) {
  const el = document.getElementById(id);
  if (!el) { console.warn('Element not found:', id); return; }
  el.addEventListener(event, fn);
}
// [피드백] night-btn 제거됨 — 버튼 자체가 DOM 에서 사라졌으므로 attach 불필요.
//   밤 진입은 집 안 침대 클릭 → handleBedClick → startSleepSequence 로만 가능.
attach('exit-interior', 'click', exitInterior);

// [피드백] ESC 키로 대화 이력 오버레이 토글.
//   또한 오버레이 자체의 닫기 버튼 바인딩.
attach('chat-history-close', 'click', function () {
  const ov = document.getElementById('chat-history-overlay');
  if (ov) ov.style.display = 'none';
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const ov = document.getElementById('chat-history-overlay');
    if (!ov) return;
    const isOpen = ov.style.display !== 'none' && ov.style.display !== '';
    if (isOpen) {
      ov.style.display = 'none';
    } else {
      // zeta 대화창이나 다른 모달이 열려있으면 그쪽 우선 (ESC 다중 처리 주의).
      // zeta 가 열려있을 때는 ESC 로 zeta 가 닫히게 두고, 오버레이는 안 열기.
      const zetaOpen = document.getElementById('zeta-chat')
        && document.getElementById('zeta-chat').classList.contains('show');
      if (zetaOpen) return;
      // 오버레이 열기 + 이력 리스트 렌더
      if (typeof renderChatHistoryOverlay === 'function') {
        try { renderChatHistoryOverlay(); } catch (err) { console.warn('[ESC overlay] render 실패', err); }
      }
      ov.style.display = 'flex';
    }
  }
});

// [9.5단계] 세션 복구 시도. 성공 시: 인트로 가챠 스킵하고 바로 마을 진입.
(async function attemptSessionRestore() {
  const restored = tryRestoreSessionOnLoad();
  if (!restored) return; // 복구 실패 → 인트로 가챠 정상 진행

  console.log('[intro] 세션 복구됨. 인트로 건너뛰고 마을 진입합니다.');

  // GLB 모델 프리로드
  try {
    if (window.__preloadAllGltfModels) {
      await window.__preloadAllGltfModels(() => {});
    }
  } catch (err) {
    console.error('[intro] preload 실패 (무시):', err);
  }

  // 인트로 숨기고 마을 진입
  const intro = document.getElementById('intro-screen');
  if (intro) intro.style.display = 'none';

  // NPC 메시 + 유저 스폰
  state.npcs.forEach(npc => {
    if (!npcMeshes[npc.id]) spawnNpcMesh(npc);
  });
  if (!state.user.mesh) spawnUserMesh();

  // UI 갱신
  renderNpcList();
  renderTabs();
  renderContent();
  renderCounts();
  if (typeof renderQuestBanner === 'function') renderQuestBanner();

  showNotification('🔄 이전 세션에서 이어집니다');
})();

// 초기 렌더링
renderNpcList();
renderTabs();
renderContent();
renderCounts();
if (typeof renderQuestBanner === 'function') renderQuestBanner(); // [9단계]

// [9.5단계] 주기적 상태 저장 (30초마다 + 페이지 떠날 때)
// __closeZeta 가 이미 개별 저장 트리거하지만, 혹시 모를 누락 방지용 안전망.
if (typeof persistState === 'function') {
  setInterval(() => { try { persistState(); } catch(e) {} }, 30000);
  window.addEventListener('beforeunload', () => { try { persistState(); } catch(e) {} });
}

// =========================================================
// 애니메이션 루프
// =========================================================
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  
  // updateNpcs는 씬 모드와 무관하게 npcMeshes 전체를 관리
  // (각 NPC의 currentScene 속성에 따라 이동 방식이 달라짐)
  updateNpcs(dt);
  
  if (state.viewMode === 'interior') {
    updateInteriorLighting();
    // 유저는 내부에서도 움직일 수 있음
    if (state.user.mesh) state.user.mesh.visible = true;
    updateUser(dt);
    updateDestinationMarker(dt);
    // 유저 이름 말풍선은 내부에서 숨김 (답답함 방지)
    if (state.user.bubbleEl) state.user.bubbleEl.classList.add('hide');
    renderer.render(interiorScene, camera);
  } else {
    // 시뮬레이션 중 유저 아바타 처리:
    //   - mode 'night'    : 유저는 집에서 자고 있음 → hide (기존 동작)
    //   - mode 'cutscene' : 유저 등장 없는 컷신 (시뮬 A) → hide (기존 동작)
    //   - mode 'ending'   : 유저가 야미와 함께 서점으로 감 → [피드백 #7] visible
    //     스크립트에 moveUser 이벤트가 있으므로 visible 상태여야 함.
    //   [피드백 #5] 엔딩 모드에선 updateUser 도 호출해야 moveUser 이벤트가 실제로 동작.
    //     moveUser 이벤트는 state.user.targetPos 만 세팅하고, 실제 이동 보간은 updateUser 에서.
    //     시뮬 중엔 지금까지 updateUser 가 호출 안 됐음 → moveUser 받은 유저가 그 자리에 멈춤.
    if (state.simulation.active) {
      const simMode = state.simulation.mode;
      const shouldShowUser = (simMode === 'ending');
      if (state.user.mesh) state.user.mesh.visible = shouldShowUser;
      // 이름 말풍선은 엔딩 중에도 숨김 (연출 집중).
      if (state.user.bubbleEl) state.user.bubbleEl.classList.add('hide');
      runSimulationTick(dt);
      // 조명만 갱신 (시간 흐름에 따른 하늘/조명)
      updateSimulationLighting();
      // 엔딩 모드에선 유저 이동 보간 처리 (moveUser 이벤트 → 실제 이동).
      if (shouldShowUser) {
        updateUser(dt);
      }
    } else {
      if (state.user.mesh) state.user.mesh.visible = true;
      updateUser(dt);
      updateDestinationMarker(dt);
      updateTimeOfDay(dt);
    }
    renderer.render(scene, camera);
  }
}
animate();
