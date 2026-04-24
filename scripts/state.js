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
  activeTab: 'report',
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
    // [시뮬 B 신규] 시뮬 도중 증거 팝업 등으로 일시정지 하기 위한 플래그.
    //   paused=true 동안 runSimulationTick 이 즉시 return → 시간·이벤트·카메라 모두 정지.
    //   재개 시 pausedAt 기준으로 startTime 을 보정해 "정지 동안의 실제 시간"을
    //   가상 시각에 누적하지 않도록 한다 (그렇지 않으면 재개 직후 이벤트 여러 개가
    //   한꺼번에 발동됨).
    paused: false,
    pausedAt: 0,
    // [시뮬 C 신규 → 시뮬 A 확장] 시뮬 모드 — 'night' | 'ending' | 'cutscene'.
    //   'night':    NIGHT_SCRIPTS[state.day] 재생. 기존 동작. phase 를 'night' 로 강제.
    //   'ending':   ENDING_SCRIPTS[endingBranch] 재생. phase 는 그대로 (낮 조명 유지).
    //               끝난 뒤 advanceToNightAndMorning 대신 runEndingPostEffects 실행.
    //   'cutscene': CUTSCENE_SCRIPTS[cutsceneId] 재생. ending 과 거의 같지만
    //               끝난 뒤 runCutscenePostEffects 가 실행되고 pendingOpenZetaNpcId 가
    //               설정되어 있으면 자동으로 openZeta 를 호출해 대화창을 연다.
    mode: 'night',
    endingBranch: null,
    cutsceneId: null,
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
    // [Wave 2 / 이슈 C 수정] 속도·위치·혼잣말 개선.
    //
    // 이전: 5장면 × 4초 = 20초, 간격 0.06 (sim.speed=1 전제)
    // 변경: 6장면 × 8초 = 48초, 간격 0.12
    //        → 시각적 액션이 차분해져서 유저가 읽고 반응할 시간 확보
    //
    // 위치 조정:
    //   - 야미: 서점 문 앞(8, 3.5) 까지 가고, 이후 서점 위치(8, 6) 로 더 들어감 ≈ "안에 들어가는" 인상
    //     (실제로 interior 전환은 안 함 — 위치만 서점 쪽으로 깊이 이동)
    //   - 차카: 서점에서 "조금 떨어진" 광장 근처(3, 2) 로 → 사진 구도용 거리감
    //
    // 혼잣말 (bubble):
    //   - 차카: "오늘 밤 풍경이 참 이쁘구만." — 서점 근처 서서 셔터 누르는 타이밍에
    //   - 야미: 약간의 혼잣말도 하나 추가 ("이 책, 드디어 내 손에…") — 서점 도착 시
    //
    // [인계용 설계 노트]
    //   - bubble 이벤트는 narration (하단 자막) 과 별개. 둘 다 동시 사용 가능.
    //   - 말풍선 duration 기본 5초, 장면 전환과 맞추려면 간격(8초) 이내로.

    // 장면 1 (0.76 ~ 0.88): 분위기 설정 + 야미 등장
    { id: 'd1_s1_intro', at: 0.76, type: 'narration',
      text: '밤이 깊어가는 동네...' },

    // 장면 2 (0.88 ~ 1.00): 야미가 서점 문 앞까지 이동 + 카메라 야미
    { id: 'd1_s2_yami_move', at: 0.88, type: 'move', npc: '야미',
      to: { x: 8, z: 4 }, // 서점 문(8, 3.5) 근처
      narration: '야미가 어디론가 발걸음을 옮기고 있어요.' },
    { id: 'd1_s2_yami_cam',  at: 0.88, type: 'camera', npc: '야미' },

    // 장면 3 (1.00 ~ 1.12): 야미 서점 안으로 깊이 이동 + 혼잣말
    { id: 'd1_s3_yami_enter', at: 1.00, type: 'move', npc: '야미',
      to: { x: 8, z: 6.5 }, // 서점 중심(8,6) 안쪽 ≈ "들어간" 느낌
      narration: '야미가 서점 안쪽으로 들어가네요.' },
    { id: 'd1_s3_yami_bubble', at: 1.02, type: 'bubble', npc: '야미',
      text: '이 책, 드디어 내 손에…', duration: 4 },

    // 장면 4 (1.12 ~ 1.24): 카메라 전환 — 차카가 서점 조금 떨어진 곳에서 야경 촬영
    { id: 'd1_s4_chaka_move', at: 1.12, type: 'move', npc: '차카',
      to: { x: 3, z: 2 }, // 광장 북쪽, 서점에서 거리감 있는 위치
      narration: '차카가 동네 어딘가에서 카메라를 들고 있어요.' },
    { id: 'd1_s4_chaka_cam',  at: 1.12, type: 'camera', npc: '차카' },
    { id: 'd1_s4_chaka_bubble', at: 1.14, type: 'bubble', npc: '차카',
      text: '오늘 밤 풍경이 참 이쁘구만.', duration: 4 },

    // 장면 5 (1.24 ~ 1.36): 차카가 셔터를 누르는 순간 — 스포 없이 담백하게
    { id: 'd1_s5_chaka_shutter', at: 1.24, type: 'narration',
      text: '차카가 한참 동안 셔터를 눌러요.' },

    // 장면 6 (1.36 ~ 1.48): 야미가 집으로 돌아감 + 카메라 야미
    { id: 'd1_s6_yami_home',  at: 1.36, type: 'move', npc: '야미',
      to: { x: 0, z: 0 },
      narration: '야미가 집으로 돌아가요.' },
    { id: 'd1_s6_yami_cam',   at: 1.36, type: 'camera', npc: '야미' },

    // 장면 종료
    { id: 'd1_end', at: 1.48, type: 'end' },
  ],

  2: [ // Day 2 밤 — 야미가 밤톨을 찾아가 해명 시도 → 오해 굳어짐
    // [시뮬 B 설계 노트]
    //
    // 서사: 야미가 가방을 들고 서점으로 감 → 밤톨이 나와 대면 →
    //       야미가 가방을 보여주며 해명 ("이 한 권뿐") →
    //       밤톨이 "그럼 사라진 한 권은?" 반박하고 들어가버림 →
    //       야미 홀로 남아 있다가 돌아감.
    //
    // 구조: Day 1 과 동일 6장면 × 8초 = 48초. at 간격 0.12.
    //       sim.speed=1 강제 (state.js startSleepSequence 에서 day===2 조건 포함).
    //
    // 신규 이벤트 타입 3종 사용:
    //   - show:     NPC 를 특정 좌표에 등장시킴 (location='outside', visible=true)
    //   - hide:     NPC 를 사라지게 함 (location=homeLocation, visible=false)
    //   - evidence: 시뮬 일시정지 + 증거 팝업. 유저가 닫으면 재개.
    //
    // 스포일러 방지:
    //   - 나레이션에 "한 권뿐" 직접 노출 금지 (야미 대사로만 전달)
    //   - 시뮬 중 evidence 로 가방 내부 이미지가 "야미가 가방 열어 보이는 순간"에 뜸
    //   - 씨앗 effects 의 showEvidencePopup 은 제거됨 (중복 방지) — bookstore.js 참고
    //
    // 좌표:
    //   - 서점 문 좌표: (8, 3.5) — data.js LOCATIONS.door 참조
    //   - 서점 안쪽:   (8, 6)   — 밤톨 퇴장 이동 지점
    //   - 광장 중앙:   (0, 0)   — 야미 귀환 지점 (yami.homeLocation='outside')

    // 장면 1 (0.76~): 분위기 설정
    { id: 'd2_s1_intro', at: 0.76, type: 'narration',
      text: '밤이 다시 내려앉았어요...' },

    // 장면 2 (0.88~): 야미가 서점 문 앞으로 이동 + 카메라 야미
    // [주의] 야미는 서점 문(8, 3.5) 보다 1유닛 앞(8, 2.5)에 서게 한다.
    //        밤톨이 show 로 문 좌표에 등장하므로, 야미가 문에 너무 붙어있으면
    //        두 NPC 메시(반경 0.5씩) 가 겹쳐 보임. 1유닛 거리가 마주보는 자연스러운 간격.
    { id: 'd2_s2_yami_move', at: 0.88, type: 'move', npc: '야미',
      to: { x: 8, z: 2.5 },
      narration: '야미가 가방을 메고 서점으로 걸어가요.' },
    { id: 'd2_s2_yami_cam', at: 0.88, type: 'camera', npc: '야미' },

    // 장면 3 (1.00~): 야미 도착 → 문 두드림 → 첫 대사 → 밤톨 등장
    { id: 'd2_s3_yami_knock', at: 1.00, type: 'narration',
      text: '야미가 서점 문을 두드려요.' },
    { id: 'd2_s3_yami_bubble', at: 1.02, type: 'bubble', npc: '야미',
      text: '사장님, 오해가 있어요.', duration: 4 },
    // 밤톨 등장 — 서점 문 좌표에 나타남. 야미의 대사가 끝나갈 무렵(1.02+4초≈1.06)
    // 에 맞춰 "두드림에 응답해 문을 열고 나온" 타이밍.
    { id: 'd2_s3_bamtol_show', at: 1.06, type: 'show', npc: '밤톨',
      position: { x: 8, z: 3.5 } },

    // 장면 4 (1.12~): 야미가 가방을 열어 보임 → evidence 팝업 (일시정지)
    { id: 'd2_s4_yami_bubble', at: 1.12, type: 'bubble', npc: '야미',
      text: '제 가방 보세요. 어제 가져간 건 이 한 권뿐이에요.', duration: 5 },
    // evidence 팝업 — 1.12 대사 시작 후 2초, 말풍선 아직 떠있는 시점에 띄워
    // "가방을 보여주는 순간"과 팝업 이미지가 정서적으로 묶이도록.
    { id: 'd2_s4_evidence', at: 1.14, type: 'evidence',
      assetKey: 'yami_backpack',
      caption: '야미의 가방 속 — 책은 한 권뿐' },

    // 장면 5 (1.24~): 밤톨 반박 → 서점 안으로 들어감
    { id: 'd2_s5_bamtol_bubble', at: 1.24, type: 'bubble', npc: '밤톨',
      text: '그럼 책장에서 사라진 한 권은 뭔데?', duration: 5 },
    // 밤톨이 서점 중앙으로 이동 (걸어가는 과정 보여줌). (8, 3.5)→(8, 6) 거리 2.5유닛,
    // NPC 속도 2.0유닛/초 → 약 1.25초 소요. 다음 hide 까지 2초 여유로 충분.
    { id: 'd2_s5_bamtol_move', at: 1.30, type: 'move', npc: '밤톨',
      to: { x: 8, z: 6 },
      narration: '밤톨이 말없이 서점 안으로 들어가요.' },
    // 밤톨 서점 안 도달 → 사라짐. location 도 bookstore 로 복원.
    { id: 'd2_s5_bamtol_hide', at: 1.32, type: 'hide', npc: '밤톨' },

    // 장면 6 (1.36~): 야미 홀로 남음 → 돌아감
    { id: 'd2_s6_yami_alone', at: 1.36, type: 'narration',
      text: '야미가 한참을 문 앞에 서 있어요.' },
    { id: 'd2_s6_yami_home', at: 1.44, type: 'move', npc: '야미',
      to: { x: 0, z: 0 }, // 광장 중앙 (yami.homeLocation='outside')
      narration: '야미가 천천히 발길을 돌려요.' },

    // 장면 종료
    { id: 'd2_end', at: 1.48, type: 'end' },
  ],
};

// =========================================================
// [시뮬 C] 엔딩 시뮬레이션 스크립트 (high / low 분기)
// =========================================================
// 재생 경로: bookstore.js 의 ending effect → scenarioEngine 이 분기 선택 →
//            startEndingSimulation(branchKey, pendingEffects) →
//            runSimulationTick 이 ENDING_SCRIPTS[branchKey] 를 소비.
//
// 이벤트 타입 재사용: narration / move / camera / bubble / show / hide / evidence / end
// 신규 타입 사용:    moveUser (유저 mesh 이동), camera{target:'user'} (유저 추적)
//
// at 기준: sim.speed=1. startEndingSimulation 이 시뮬 시작 시 state.timeOfDay 를
//          엔딩 시작 시각(예: 0.5) 으로 세팅하지 않고, 대신 sim.startTime 만 기록하고
//          virtualTime 계산은 "엔딩 진입 시각" 대비 경과 시각으로 한다.
//          runSimulationTick 의 virtualTime 계산식이 night 시뮬과 다르지 않게
//          하려면, ENDING_SCRIPTS 의 at 은 "엔딩 시작 후 가상 시각 증가분" 으로
//          해석한다. 즉 at=0 이 시작 순간, at=0.72 이 48초 경과.
//          실제 virtualTime 계산은 runSimulationTick 안에서 mode 분기로 처리.
//
// 스포일러·톤:
//   - 나레이션에 "한 권" 같은 구체 사실 남발하지 않음
//   - 엔딩 본문의 대사는 원작 텍스트 그대로 보존 (축 4 사용자 지시)
//   - 유저 mesh 는 moveUser 로 움직이되, 원작 "당신" 주어 감각을 유지

const ENDING_SCRIPTS = {
  high: [
    // 장면 1 (0~): 햇살 / 유저 카메라
    { id: 'e_high_s1_intro', at: 0, type: 'narration',
      text: '햇살이 도시 위로 다시 내려와요.' },
    { id: 'e_high_s1_cam', at: 0.02, type: 'camera', target: 'user' },

    // 장면 2 (0.10~): 유저 먼저 서점 쪽으로
    { id: 'e_high_s2_user_move', at: 0.10, type: 'moveUser',
      to: { x: 8, z: 4.5 },
      narration: '당신이 서점 쪽으로 걸어가요.' },

    // 장면 3 (0.20~): 밤톨이 뒤따라 나와 합류
    { id: 'e_high_s3_bamtol_show', at: 0.20, type: 'show', npc: '밤톨',
      position: { x: 8, z: 3.5 } },
    { id: 'e_high_s3_bamtol_bubble', at: 0.22, type: 'bubble', npc: '밤톨',
      text: '...같이 찾아봅시다.', duration: 4 },
    { id: 'e_high_s3_user_move2', at: 0.26, type: 'moveUser',
      to: { x: 8, z: 5.5 } }, // 서점 안쪽으로 더
    { id: 'e_high_s3_bamtol_move', at: 0.26, type: 'move', npc: '밤톨',
      to: { x: 8.7, z: 5 } }, // 유저 옆 살짝

    // 장면 4 (0.36~): 함께 뒤짐
    { id: 'e_high_s4_search', at: 0.36, type: 'narration',
      text: '두 사람이 책장 구석구석을 살펴요.' },

    // 장면 5 (0.48~): 책 발견 + 증거 팝업
    { id: 'e_high_s5_notice', at: 0.48, type: 'narration',
      text: '책장 밑에서 뭔가가 눈에 들어와요.' },
    { id: 'e_high_s5_evidence', at: 0.50, type: 'evidence',
      assetKey: 'missing_book_found',
      caption: '책장 아래에서 발견된 책' },

    // 장면 6 (0.60~): 밤톨의 결심
    { id: 'e_high_s6_bamtol_bubble', at: 0.60, type: 'bubble', npc: '밤톨',
      text: '...야미한테 사과해야겠네.', duration: 5 },
    { id: 'e_high_s6_sigh', at: 0.66, type: 'narration',
      text: '밤톨이 한숨을 쉬고 고개를 떨궈요.' },

    // 장면 종료
    { id: 'e_high_end', at: 0.72, type: 'end' },
  ],

  low: [
    // 장면 1 (0~): 밤톨 부재 / 유저+야미로 시작
    { id: 'e_low_s1_intro', at: 0, type: 'narration',
      text: '밤톨은 여전히 문을 걸어둔 채예요.' },
    { id: 'e_low_s1_cam', at: 0.02, type: 'camera', target: 'user' },

    // 장면 2 (0.08~): 야미 등장, 유저+야미 서점 쪽으로
    { id: 'e_low_s2_yami_show', at: 0.08, type: 'show', npc: '야미',
      position: { x: 0, z: 0 } }, // 광장 중앙
    { id: 'e_low_s2_user_move', at: 0.10, type: 'moveUser',
      to: { x: 0, z: 0.8 }, // 야미 옆에서 합류
      narration: '당신과 야미가 서점으로 향해요.' },
    { id: 'e_low_s2_yami_move', at: 0.10, type: 'move', npc: '야미',
      to: { x: 0, z: 1.5 } },

    // 장면 3 (0.20~): 함께 서점 쪽으로 이동
    { id: 'e_low_s3_user_move2', at: 0.20, type: 'moveUser',
      to: { x: 8, z: 5 } },
    { id: 'e_low_s3_yami_move2', at: 0.20, type: 'move', npc: '야미',
      to: { x: 8.7, z: 5 } },

    // 장면 4 (0.34~): 함께 뒤짐
    { id: 'e_low_s4_search', at: 0.34, type: 'narration',
      text: '두 사람이 책장 구석구석을 살펴요.' },

    // 장면 5 (0.44~): 책 발견 + 증거 팝업
    { id: 'e_low_s5_notice', at: 0.44, type: 'narration',
      text: '책장 밑에서 뭔가가 눈에 들어와요.' },
    { id: 'e_low_s5_evidence', at: 0.46, type: 'evidence',
      assetKey: 'missing_book_found',
      caption: '책장 아래에서 발견된 책' },

    // 장면 6 (0.54~): 야미가 밤톨에게 감
    { id: 'e_low_s6_bamtol_show', at: 0.54, type: 'show', npc: '밤톨',
      position: { x: 8, z: 3.2 } }, // 서점 앞 (어제 시뮬 B 마지막 위치 이어지는 느낌)
    { id: 'e_low_s6_yami_move3', at: 0.54, type: 'move', npc: '야미',
      to: { x: 8, z: 4 } },
    { id: 'e_low_s6_cam', at: 0.54, type: 'camera', npc: '야미' },
    { id: 'e_low_s6_yami_bubble', at: 0.58, type: 'bubble', npc: '야미',
      text: '사장님, 이것 좀 보세요.', duration: 4 },
    { id: 'e_low_s6_receive', at: 0.64, type: 'narration',
      text: '밤톨이 말없이 책을 받아들어요.' },
    { id: 'e_low_s6_bow', at: 0.68, type: 'narration',
      text: '밤톨이 조용히 고개를 떨궈요.' },

    // 장면 종료
    { id: 'e_low_end', at: 0.76, type: 'end' },
  ],
};

// =========================================================
// [시뮬 A] 컷신 시뮬레이션 스크립트 (낮 중간 연출용)
// =========================================================
// 재생 경로:
//   bookstore.js 의 playCutscene effect → _applyEffects 가 해당 effect 에서 루프 break,
//   뒤 effects 를 followUp 으로 수집 → startCutsceneSimulation(cutsceneId, followUp, openZetaNpcId)
//   → 현재 UI 큐에 뭔가 표시 중이면 (evidence 팝업 등) 그게 닫힌 뒤에 시뮬 시작.
//
// 이벤트 타입 재사용: narration / move / camera / bubble / show / hide / end
// 신규 타입 없음 (시뮬 B/C 엔진 그대로).
//
// at 기준: sim.speed=1. virtualTime = elapsedSec * 0.015 * 1 (엔딩과 동일 방식).
//          at=0 이 시작 순간, at=0.58 이 약 38.7초 경과 시 종료.
//
// 스포일러·톤:
//   - 나레이션에 구체 사실 직접 노출 금지 (밤톨의 오해 결론은 나레이션이 아닌 대사로만)
//   - 차카는 평온·관찰 톤, 밤톨은 초반 수용 → S5 부터 굳어지는 대비

const CUTSCENE_SCRIPTS = {
  chaka_bamtol_photo_confrontation: [
    // 장면 0 (0): NPC 배치 + 카메라. 페이드 중이라 유저에겐 안 보임.
    { id: 'c1_s0_show_bamtol', at: 0, type: 'show', npc: '밤톨',
      position: { x: -6.5, z: -5 } },
    { id: 'c1_s0_show_chaka', at: 0, type: 'show', npc: '차카',
      position: { x: -8, z: -4.5 } },
    { id: 'c1_s0_cam', at: 0, type: 'camera', npc: '차카' },

    // 장면 1 (0.02~): 밤톨이 먼저 말을 건넴
    { id: 'c1_s1_bamtol', at: 0.02, type: 'bubble', npc: '밤톨',
      text: '저기, 차카. 이 사진...', duration: 3 },

    // 장면 2 (0.08~): 차카가 사진 설명
    { id: 'c1_s2_chaka', at: 0.08, type: 'bubble', npc: '차카',
      text: '어제 밤에 찍은 거에요. 서점 근처 야경이요.', duration: 4 },

    // 장면 2b (0.15~): 밤톨이 사진을 들여다봄 (유저 시선을 밤톨 쪽으로)
    { id: 'c1_s2b_lookcloser', at: 0.15, type: 'narration',
      text: '밤톨이 사진을 가까이 들여다봐요.' },

    // 장면 3 (0.20~): 밤톨의 관찰 — 아직 수용 톤. 톤 주의: "~군" (speechHabit).
    { id: 'c1_s3_bamtol', at: 0.20, type: 'bubble', npc: '밤톨',
      text: '야미가 책 찾으러 왔던 모양이군.', duration: 4 },

    // 장면 4 (0.27~): 차카의 무심한 한 마디 — 왜곡의 방아쇠.
    { id: 'c1_s4_chaka', at: 0.27, type: 'bubble', npc: '차카',
      text: '아, 그러고 보니. 야미는 책을 참 많이 사더라고요.', duration: 4.5 },

    // 장면 5 (0.35~): 밤톨의 짧은 반응 — 머릿속 스위치가 켜짐.
    { id: 'c1_s5_bamtol_what', at: 0.35, type: 'bubble', npc: '밤톨',
      text: '...많이?', duration: 3 },

    // 장면 6 (0.40~): 밤톨의 혼잣말 — 예약 장부와 충돌.
    { id: 'c1_s6_bamtol_book', at: 0.40, type: 'bubble', npc: '밤톨',
      text: '어제 예약은 한 권이었는데.', duration: 4 },

    // 장면 7 (0.47~): 결심.
    { id: 'c1_s7_bamtol_go', at: 0.47, type: 'bubble', npc: '밤톨',
      text: '내가 한번 가 봐야겠군.', duration: 3 },

    // 장면 8 (0.52~): 밤톨이 떠남. 광장 방향(-3, -3).
    //   컷신 끝난 뒤 밤톨은 이 자리에 남음 — "광장으로 돌아서 간 뒤"의 연속감.
    //   hide 하지 않으므로 이어지는 낮 씬에서 밤톨이 (-3, -3) 근처에 자연스럽게 존재.
    { id: 'c1_s8_bamtol_leave', at: 0.52, type: 'move', npc: '밤톨',
      to: { x: -3, z: -3 },
      narration: '밤톨이 돌아서서 광장 쪽으로 떠나요.' },

    // 장면 종료
    { id: 'c1_end', at: 0.58, type: 'end' },
  ],

  // =========================================================
  // [Tier 2 #11] 독서 모임은 어떻게 될까 — 컷신 승격
  // =========================================================
  // 원래는 showEvidencePopup + showStoryModal 두 개로 처리됐지만
  // (Image 5/6), 사용자 요청으로 NPC 연출 씬으로 재구성.
  //
  // 재생 경로:
  //   yami_retries_bookclub 이벤트 (quest_active 단계 진입 즉시 auto) →
  //   playCutscene effect → startCutsceneSimulation('yami_at_bookstore').
  //   이 컷신은 openZetaNpcId 없음 — 끝난 뒤 대화창 자동 오픈 없이 낮 탐색으로 복귀.
  //   이후 유저가 야미에게 접근하면 yami_seeks_user 이벤트가 발동해
  //   "...너 잠깐 와볼래?" 선발화 + 퀘스트 생성 (기존 로직).
  //
  // 장면 설계 (3-4장면, 간단, 약 24초 @ speed=1, 12초 @ speed=2):
  //   1) 야미가 서점 앞에 서서 포스터 꺼냄 (나레이션)
  //   2) 밤톨이 문 열고 나옴
  //   3) 야미 "사장님, 혹시..." / 밤톨 "지금은 곤란해." (짧은 거절)
  //   4) 야미가 포스터를 쥐고 어깨 떨구는 나레이션
  //
  // 좌표:
  //   서점 (8, 6), 문 (8, 3.5)
  //   야미 배치: (8, 2.5) — 문 앞
  //   밤톨 배치: (8, 3.5) — 문가 (나올 때)
  yami_at_bookstore: [
    // [피드백] 타이밍 재조정:
    //   이전: at 0.02 에 narration → 페이드 인 전에 뜸. 화면-대사 빗나감.
    //         show 와 narration 이 같은 at 에 붙어 순간 텔레포트 + 해설 동시 발생.
    //   수정: 페이드 뒤 1.5초 이상 여유. show 이벤트와 narration 을 별도 프레임으로.
    //   속도: sim.speed=2 기준 총 약 20초.

    // 장면 0 (0): 야미 등장 + 카메라 고정. 페이드 인 시작.
    { id: 'c2_s0_show_yami', at: 0, type: 'show', npc: '야미',
      position: { x: 8, z: 2.5 } },
    { id: 'c2_s0_cam', at: 0, type: 'camera', npc: '야미' },

    // 장면 1 (0.05~, 약 1.67초): 야미가 포스터 꺼냄. 페이드 끝난 뒤 충분히 뜸 두고 나레이션.
    { id: 'c2_s1_poster', at: 0.05, type: 'narration',
      text: '야미가 가방에서 포스터 한 장을 꺼내 서점 앞에 섰어요.' },

    // 장면 2a (0.15~, 약 5초): 서점 문이 열림 — 먼저 나레이션으로 문 열리는 순간 알림.
    { id: 'c2_s2a_door_opens', at: 0.15, type: 'narration',
      text: '잠시 후, 서점 문이 열려요.' },

    // 장면 2b (0.17~, 약 5.67초): 밤톨 등장. narration 약간 뒤에 show — 순간 텔레포트 느낌 완화.
    { id: 'c2_s2b_show_bamtol', at: 0.17, type: 'show', npc: '밤톨',
      position: { x: 8, z: 3.5 } },

    // 장면 3 (0.22~, 약 7.3초): 야미가 조심스럽게 말 꺼냄.
    { id: 'c2_s3_yami', at: 0.22, type: 'bubble', npc: '야미',
      text: '사장님, 혹시 이번 주말에 독서 모임 열 수 있을까요?', duration: 5 },

    // 장면 4 (0.32~, 약 10.7초): 밤톨이 포스터를 보지도 않고 거절.
    { id: 'c2_s4_bamtol', at: 0.32, type: 'bubble', npc: '밤톨',
      text: '...지금은 곤란해.', duration: 3.5 },

    // 장면 5a (0.42~, 약 14초): 밤톨이 돌아서는 순간 나레이션.
    { id: 'c2_s5a_turn', at: 0.42, type: 'narration',
      text: '밤톨이 뒤돌아 서점 안으로 들어가요.' },

    // 장면 5b (0.44~, 약 14.7초): 실제 hide — narration 보다 살짝 뒤에 실행.
    { id: 'c2_s5b_hide', at: 0.44, type: 'hide', npc: '밤톨' },

    // 장면 6 (0.52~, 약 17.3초): 야미의 여운.
    { id: 'c2_s6_yami_sad', at: 0.52, type: 'narration',
      text: '포스터가 야미의 손에서 힘없이 구부러졌어요.' },

    // 장면 종료
    { id: 'c2_end', at: 0.60, type: 'end' },
  ],
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

// [피드백 A2] 아침 소식 전용 신문 스타일 모달.
//   기존 showStoryModal 은 단순 제목+본문. 이 함수는 신문 제호 + 헤드라인 + 기사 카드 형식.
//   reports: [{ line, primaryNpcId }] 배열. bodyIntro 는 맨 위 소제목.
//   닫기 버튼: 기존 story-modal 구조를 재사용하되 body 에 HTML 을 직접 주입한다.
//
//   레이아웃:
//   ┌─────────────────────────────────┐
//   │        동네 소식                │
//   │        Day N · 아침판           │
//   ├─────────────────────────────────┤
//   │ [오늘의 헤드]                   │
//   │ 첫 번째 리포트                  │
//   ├─────────────────────────────────┤
//   │ 📸 차카: 두 번째 리포트         │
//   │ 📚 밤톨: 세 번째 리포트         │
//   └─────────────────────────────────┘
function showNewsModal(title, bodyIntro, reports) {
  // escape 유틸 (state.js 내부엔 없어서 인라인 구현 — gameplay.js 의 것과 동일 로직).
  const esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  const safeReports = Array.isArray(reports) ? reports : [];
  const headline = safeReports.length > 0 ? (safeReports[0].line || '') : '';
  const rest = safeReports.slice(1);

  // NPC 이름/이모지 조회 (state.npcs 에서)
  const getNpc = function (npcId) {
    if (!npcId || !Array.isArray(state.npcs)) return null;
    return state.npcs.find(function (n) { return n.id === npcId; });
  };

  const html =
    '<div class="news-paper news-paper--modal">' +
      '<div class="news-masthead">' +
        '<div class="news-masthead-title">동네 소식</div>' +
        '<div class="news-masthead-date">' + esc(title.replace(/[🌅🌄]/g, '').trim()) + '</div>' +
      '</div>' +
      (bodyIntro ? '<div class="news-intro">' + esc(bodyIntro) + '</div>' : '') +
      (safeReports.length === 0
        ? '<div class="news-empty">(특별한 소식은 없었어요.)</div>'
        : '<div class="news-lead">' +
            '<div class="news-lead-kicker">오늘의 헤드</div>' +
            '<div class="news-lead-headline">' + esc(headline) + '</div>' +
          '</div>' +
          (rest.length > 0
            ? '<div class="news-articles">' +
                rest.map(function (r) {
                  const npc = getNpc(r.primaryNpcId);
                  const byline = npc ? (npc.emoji || '📜') + ' ' + npc.name : '📜 동네';
                  return '<article class="news-article">' +
                    '<div class="news-article-head">' +
                      '<span class="news-article-byline">' + esc(byline) + '</span>' +
                    '</div>' +
                    '<div class="news-article-body">' + esc(r.line || '(내용 없음)') + '</div>' +
                  '</article>';
                }).join('') +
              '</div>'
            : '')
      ) +
    '</div>';

  document.getElementById('story-modal-title').textContent = title;
  const bodyEl = document.getElementById('story-modal-body');
  bodyEl.innerHTML = html;
  // 기본 story-modal body 는 white-space: pre-line 이라 HTML 안에서 개행 쌓일 수 있음.
  // 신문 뷰는 자체 레이아웃이므로 pre-line 해제.
  bodyEl.style.whiteSpace = 'normal';
  document.getElementById('story-modal').classList.add('show');
}
window.__showNewsModal = showNewsModal;

// [피드백 B1] 엔딩 예고 모달 — 단일 "확인" 버튼, 누르면 onConfirm 콜백 실행.
//   showConfirmModal 은 예/아니오 두 버튼 구조라 단일 알림엔 부적합.
//   showStoryModal 은 콜백 없음.
//   이 함수는 둘 사이의 틈을 메움: 단일 버튼 + 콜백.
function showEndingPreviewModal(title, body, onConfirm) {
  // 기존 모달 정리
  const existing = document.getElementById('ending-preview-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ending-preview-modal';
  modal.style.cssText =
    'position: fixed; inset: 0; z-index: 650;' +
    'background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);' +
    'display: flex; align-items: center; justify-content: center; padding: 20px;';
  modal.innerHTML =
    '<div style="background: white; border-radius: 24px; padding: 28px 24px; max-width: 440px; width: 100%; ' +
         'box-shadow: 0 20px 60px rgba(0,0,0,0.25); border: 3px solid #ffeef2;">' +
      '<h2 style="margin: 0 0 14px; font-size: 19px; color: #3a2a1a;">' +
        String(title || '').replace(/</g, '&lt;') +
      '</h2>' +
      '<p style="margin: 0 0 22px; line-height: 1.65; color: #555; white-space: pre-line; font-size: 14px;">' +
        String(body || '').replace(/</g, '&lt;') +
      '</p>' +
      '<div style="display: flex; justify-content: flex-end;">' +
        '<button id="ending-preview-ok" style="padding: 10px 28px; border: none; ' +
          'background: linear-gradient(135deg, #ffa76b 0%, #ff7a9c 100%); color: white; ' +
          'border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 700;">확인</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const btn = document.getElementById('ending-preview-ok');
  btn.addEventListener('click', function () {
    modal.remove();
    if (typeof onConfirm === 'function') {
      try { onConfirm(); } catch (err) { console.error('[ending preview] onConfirm 오류:', err); }
    }
  });
}
window.showEndingPreviewModal = showEndingPreviewModal;

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

// [피드백 C1] 시뮬 중 비참여 NPC 를 화면에서 숨기는 유틸.
//   시뮬 스크립트 events 배열을 받아 거기 등장하는 NPC name 들을 수집 (show/move/hide/bubble).
//   그 외 NPC 는 mesh.visible = false + 말풍선 hide + scriptedTarget 해제.
//   시뮬이 끝나면 endSimulation 안전망이 homeLocation 으로 복원하면서 자동 재표시.
//
//   왜 필요한가:
//     스크린샷 3 — 시뮬 A (차카-밤톨 사진관 앞 대화) 중 야미가 근처에 뜬금없이 있음.
//     시뮬이 NPC 스케줄러를 정지시키긴 하지만, 이미 밖에 나와있던 NPC 는 그대로 visible.
//     연출상 등장하지 않는 NPC 는 시뮬 동안 잠시 숨기는 게 자연스러움.
function hideNonParticipatingNpcs(scriptEvents) {
  if (!Array.isArray(scriptEvents)) return;
  // 참여자 수집
  const participants = new Set();
  for (const ev of scriptEvents) {
    if (ev && ev.npc) participants.add(ev.npc);
  }
  // 참여 안 하는 NPC 처리
  (state.npcs || []).forEach(function (npc) {
    if (!npc || participants.has(npc.name)) return;
    const m = npcMeshes[npc.id];
    if (!m) return;
    // 원상 복원 정보는 endSimulation 안전망이 location 기반으로 처리.
    // 여기서는 시뮬 동안만 hide. location 은 그대로 두되 표시만 끈다.
    m.mesh.visible = false;
    if (m.speechBubbleEl) m.speechBubbleEl.classList.add('hide');
    if (m.chatBubbleEl) m.chatBubbleEl.classList.add('hide');
    m.scriptedTarget = null;
    m.state = 'idle';
  });
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
    // [시뮬 C/A 추가] 밤 시뮬 모드 명시. 엔딩/컷신 시뮬 재생 후 endSimulation 에서
    // 이미 리셋되지만, 방어적으로 한번 더 세팅 (동시 호출/레이스 대비).
    sim.mode = 'night';
    sim.endingBranch = null;
    sim.cutsceneId = null;
    // [카테고리 1 수정] Day 1 은 느긋하게 (4초 간격 연출 설계), 그 외엔 기본 3배속
    // [시뮬 B 추가] Day 2 밤 시뮬도 speed=1 — Day 1 과 동일한 템포 (장면당 8초) 로 설계됨.
    //              at 간격 0.12 × 스크립트 시계 0.015 = 장면당 8초 (speed=1 전제).
    //              3배속으로 돌리면 장면당 2.7초밖에 안 되어 유저가 인지할 시간이 없음.
    // [Tier 1 #1] 사용자 피드백 — 모든 시뮬 2배속. Day 1/2 는 speed=2, 그 외(사용하지 않지만)는 3.
    //             장면당 8초 설계 → 2배속으로 장면당 4초가 됨.
    sim.speed = (state.day === 1 || state.day === 2) ? 2 : 3;

    // [피드백 C1] 이 밤 스크립트에 등장하지 않는 NPC 는 시뮬 동안 hide.
    //   다른 NPC 가 랜덤으로 마을 어딘가에 있어서 연출 프레임에 들어오는 것 방지.
    hideNonParticipatingNpcs(NIGHT_SCRIPTS[state.day] || []);
    
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

// =========================================================
// [시뮬 C] 엔딩 시뮬레이션 진입점
// =========================================================
// scenarioEngine.js 의 ending effect 핸들러가 분기 선택 후 호출.
//   - branchKey:      'high' | 'low' 등 ENDING_SCRIPTS 의 키
//   - pendingEffects: 엔딩 branch 의 effects 배열 (changeAffinity 등).
//                     이 배열은 시뮬 끝난 뒤 runEndingPostEffects 에서 실행.
//
// 차이점 (startSleepSequence 대비):
//   - 침대/수면 개념 없음. 낮에 발동.
//   - phase 를 'night' 로 강제하지 않음 (runSimulationTick 이 mode 보고 판단).
//   - endSimulation 에서 advanceToNightAndMorning 호출하지 않음 (mode 분기).
//   - sim.speed = 1 강제 (유저 인지 속도 유지).
//   - mode='ending', endingBranch=branchKey 세팅.
//   - virtualTime 기준을 엔딩 진입 순간으로 하기 위해 startTime 만 기록.
let __pendingEndingEffects = null;

function startEndingSimulation(branchKey, pendingEffects) {
  if (!ENDING_SCRIPTS[branchKey]) {
    console.warn('[sim] startEndingSimulation: 스크립트 없음. branchKey=' + branchKey);
    // 스크립트 없으면 바로 post-effects 만 실행하고 끝냄.
    __pendingEndingEffects = pendingEffects || null;
    runEndingPostEffects();
    return;
  }
  console.log('[sim] startEndingSimulation: branchKey=' + branchKey);

  // 대기 중인 effects 저장 (시뮬 종료 시 runEndingPostEffects 가 실행).
  __pendingEndingEffects = pendingEffects || [];

  // 현재 인테리어 안이면 마을 뷰로 빠져나옴 (엔딩은 서점 외곽에서 벌어짐).
  if (state.viewMode === 'interior' && typeof exitInterior === 'function') {
    exitInterior();
  }

  // 페이드 후 시뮬 시작.
  fadeToBlack(1000, () => {
    const sim = state.simulation;
    sim.active = true;
    sim.mode = 'ending';
    sim.endingBranch = branchKey;
    sim.startTime = performance.now();
    sim.eventsFired = new Set();
    sim.cameraMode = 'cinematic';
    sim.cinematicTarget = null;
    // [Tier 1 #1] 2배속
    sim.speed = 2;
    sim.paused = false;
    sim.pausedAt = 0;

    // [피드백 C1] 이 엔딩 스크립트에 등장하지 않는 NPC 는 시뮬 동안 hide.
    hideNonParticipatingNpcs(ENDING_SCRIPTS[branchKey] || []);

    // 카메라 초기 위치 — 서점 근처로 살짝 미리 당겨놓음.
    cameraAngle = Math.PI / 4;
    cameraPitch = Math.PI / 3.5;
    cameraDist = 22;
    cameraTarget.set(4, 0, 3);
    updateCamera();

    // 시뮬 UI 표시
    showSimulationUI();

    // 페이드 인
    setTimeout(() => fadeFromBlack(1000), 300);
  });
}

// [시뮬 C] 엔딩 시뮬 종료 후 실행.
//   - __pendingEndingEffects (changeAffinity 등) 를 scenarioEngine 의 _applyEffects 로 실행.
//   - engine 객체가 없거나 실행 불가 상태면 경고만 찍고 넘어감 (유저 경험상 치명적이지 않음).
function runEndingPostEffects() {
  const effects = __pendingEndingEffects;
  __pendingEndingEffects = null;
  if (!effects || !effects.length) {
    console.log('[sim] runEndingPostEffects: 실행할 effects 없음');
    return;
  }
  if (typeof window !== 'undefined' && window.scenarioEngine &&
      typeof window.scenarioEngine.applyEndingPostEffects === 'function') {
    try {
      window.scenarioEngine.applyEndingPostEffects(effects);
    } catch (err) {
      console.error('[sim] runEndingPostEffects: 실행 오류', err);
    }
  } else {
    console.warn('[sim] runEndingPostEffects: scenarioEngine.applyEndingPostEffects 미정의');
  }
}

// =========================================================
// [시뮬 A] 컷신 시뮬레이션 진입점
// =========================================================
// scenarioEngine 의 _applyEffects 안에서 playCutscene effect 를 만나면 호출.
//   - cutsceneId:           CUTSCENE_SCRIPTS 의 키
//   - followUpEffects:      playCutscene 이후에 오던 나머지 effects (evidence 는 이미 앞에서
//                           처리되어 여기엔 오지 않음. addRumor/changeAffinity/injectNpcContext/
//                           npcSpeaksFirst 등이 들어옴)
//   - openZetaNpcId:        컷신 끝난 뒤 자동으로 열 대화창의 NPC id (예: 'chaka')
//
// UI 큐가 비어있지 않으면 (예: 바로 앞에 뜬 evidence 팝업이 아직 열려 있음)
// 그게 닫힌 뒤에 시작한다. 이를 위해 scenarioEngine 의 _uiQueue.afterComplete 슬롯을 사용.
//
// 시작 시:
//   - fadeToBlack 으로 화면을 검게 만들고, 그 안에서 NPC 텔레포트 + 카메라 재세팅.
//   - 스크립트의 at=0 이벤트(show/camera)가 첫 프레임에 발동.
//   - fadeFromBlack.
let __pendingCutsceneFollowUp = null;
let __pendingOpenZetaNpcId = null;

function startCutsceneSimulation(cutsceneId, followUpEffects, openZetaNpcId) {
  if (!CUTSCENE_SCRIPTS[cutsceneId]) {
    console.warn('[sim] startCutsceneSimulation: 스크립트 없음. cutsceneId=' + cutsceneId);
    // 컷신 못 찾으면 followUp 바로 실행 + 대화창 열기
    __pendingCutsceneFollowUp = followUpEffects || null;
    __pendingOpenZetaNpcId = openZetaNpcId || null;
    runCutscenePostEffects();
    return;
  }
  console.log('[sim] startCutsceneSimulation: cutsceneId=' + cutsceneId);

  // [시뮬 A 중요] 즉시 플래그 세팅 — selectNpc 등 호출부가 컷신 개시 직후
  // 이어서 openZeta 등을 호출하지 않도록 차단용. sim.active 는 fadeToBlack 콜백
  // 이후에야 true 가 되므로 그 사이 공백을 이 플래그가 메운다.
  // endSimulation 또는 _startCutsceneCore 진입 시 해제.
  state.cutscenePending = true;

  __pendingCutsceneFollowUp = followUpEffects || [];
  __pendingOpenZetaNpcId = openZetaNpcId || null;

  // UI 큐에 뭔가 표시 중이면 (evidence 팝업 등) 그게 닫힌 뒤에 컷신 시작.
  // scenarioEngine 의 _uiQueue 상태를 확인. afterComplete 슬롯에 자기를 걸어둠.
  const waitForUi = function () {
    const engine = (typeof window !== 'undefined') ? window.scenarioEngine : null;
    if (engine && engine._uiQueueState &&
        (engine._uiQueueState.current || engine._uiQueueState.pending.length > 0)) {
      // 엔진이 큐 비워질 때 호출할 콜백 등록.
      if (typeof engine.onUiQueueDrain === 'function') {
        engine.onUiQueueDrain(_startCutsceneCore.bind(null, cutsceneId));
        return;
      }
      // fallback: 폴링 (스윽 확인만. 100ms 간격)
      const poll = setInterval(function () {
        const s = engine._uiQueueState;
        if (!s.current && s.pending.length === 0) {
          clearInterval(poll);
          _startCutsceneCore(cutsceneId);
        }
      }, 100);
      return;
    }
    // 큐 비어있으면 즉시 시작
    _startCutsceneCore(cutsceneId);
  };

  waitForUi();
}

// [시뮬 A 내부] 실제 컷신 시뮬을 시작하는 코어 함수.
function _startCutsceneCore(cutsceneId) {
  // 인테리어 안이면 빠져나옴 (컷신은 마을 외부 기준)
  if (state.viewMode === 'interior' && typeof exitInterior === 'function') {
    exitInterior();
  }

  fadeToBlack(800, () => {
    const sim = state.simulation;
    sim.active = true;
    sim.mode = 'cutscene';
    sim.cutsceneId = cutsceneId;
    sim.endingBranch = null;
    sim.startTime = performance.now();
    sim.eventsFired = new Set();
    sim.cameraMode = 'cinematic';
    sim.cinematicTarget = null;
    // [Tier 1 #1] 2배속
    sim.speed = 2;
    sim.paused = false;
    sim.pausedAt = 0;

    // sim.active 가 true 가 됐으므로 cutscenePending 은 이제 필요 없음 — 해제.
    // (selectNpc 등 외부 호출부는 sim.active 로 차단됨)
    state.cutscenePending = false;

    // [피드백 C1] 이 컷신 스크립트에 등장하지 않는 NPC 는 시뮬 동안 hide.
    //   스크린샷 3 이슈 — 시뮬 A 중 야미가 근처에 떠서 연출 깨짐.
    hideNonParticipatingNpcs(CUTSCENE_SCRIPTS[cutsceneId] || []);

    // 카메라 초기 위치 — 사진관(-8, -6) 근처로 미리 당겨놓음.
    // CUTSCENE_SCRIPTS 의 S0 camera 이벤트가 첫 프레임에 발동하면서 차카 타겟이 설정됨.
    cameraAngle = Math.PI / 4;
    cameraPitch = Math.PI / 3.5;
    cameraDist = 18;
    cameraTarget.set(-8, 0, -5);
    updateCamera();

    showSimulationUI();

    setTimeout(() => fadeFromBlack(800), 200);
  });
}

// [시뮬 A] 컷신 시뮬 종료 후 실행.
//   1) pendingCutsceneFollowUp 의 effects 를 scenarioEngine._applyEffectsDirect 로 실행
//      (changeAffinity/addRumor/injectNpcContext/npcSpeaksFirst 등)
//   2) UI 큐가 비어있다는 전제 하에 (followUp 에 팝업 effect 는 이제 없음) 바로
//      openZeta(pendingOpenZetaNpcId) 호출해 대화창 오픈.
function runCutscenePostEffects() {
  const followUp = __pendingCutsceneFollowUp;
  const zetaId   = __pendingOpenZetaNpcId;
  __pendingCutsceneFollowUp = null;
  __pendingOpenZetaNpcId = null;

  // followUp effects 실행 (비시각적 — 팝업 없음)
  if (Array.isArray(followUp) && followUp.length > 0) {
    if (typeof window !== 'undefined' && window.scenarioEngine &&
        typeof window.scenarioEngine.applyCutsceneFollowUp === 'function') {
      try {
        window.scenarioEngine.applyCutsceneFollowUp(followUp);
      } catch (err) {
        console.error('[sim] runCutscenePostEffects: followUp 실행 오류', err);
      }
    } else {
      console.warn('[sim] runCutscenePostEffects: scenarioEngine.applyCutsceneFollowUp 미정의');
    }
  }

  // 대화창 자동 오픈
  if (zetaId && typeof openZeta === 'function') {
    // 약간의 지연을 두어 페이드 인이 어느 정도 진행된 뒤 대화창이 뜨게.
    setTimeout(() => {
      try { openZeta(zetaId); }
      catch (err) { console.error('[sim] runCutscenePostEffects: openZeta 오류', err); }
    }, 500);
  }
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
        // [피드백 #차카안보임] NPC 가 인테리어 안(currentScene='interior') 이거나
        //   homeLocation 에 있으면 (npc.location != 'outside') mesh.visible=false 상태.
        //   이 상태에서 move 만 주면 NPC 는 visible 안 됨 — "카메라는 따라가는데 캐릭터 없음".
        //   → move 이벤트는 암묵적 show 를 내포해야 함. 외부 씬으로 끌어내고 visible=true.
        //   show 이벤트가 별도로 있으면 그게 먼저 처리되어 이 블록은 no-op.
        if (mesh.currentScene === 'interior' || !mesh.mesh.visible) {
          // interiorScene 에 있으면 outside 씬으로 옮김.
          if (mesh.currentScene === 'interior') {
            if (typeof interiorScene !== 'undefined' && typeof scene !== 'undefined') {
              try {
                interiorScene.remove(mesh.mesh);
                scene.add(mesh.mesh);
              } catch (e) { /* 이미 scene 에 있을 수도 — 무시 */ }
            }
            mesh.currentScene = 'outside';
          }
          // 인테리어 좌표가 외부 씬에 그대로 대입되면 뜬금없는 위치에 뜸.
          // → homeLocation 의 문 좌표로 먼저 텔레포트. (door 정보 없으면 건물 중심.)
          if (target.homeLocation && target.homeLocation !== 'outside') {
            const homeLoc = (typeof LOCATIONS !== 'undefined')
              ? LOCATIONS.find(l => l.interior === target.homeLocation)
              : null;
            if (homeLoc) {
              const spawnX = homeLoc.door ? homeLoc.door.x : homeLoc.x;
              const spawnZ = homeLoc.door ? homeLoc.door.z : homeLoc.z;
              mesh.mesh.position.set(spawnX, 0, spawnZ);
            }
          }
          mesh.mesh.visible = true;
          if (mesh.speechBubbleEl) mesh.speechBubbleEl.classList.remove('hide');
          target.location = 'outside';
          mesh.buildingState = 'wandering';
        }

        mesh.scriptedTarget = new THREE.Vector3(ev.to.x, 0, ev.to.z);
        mesh.state = 'walking';
      }
    }
    if (ev.narration) setSimulationEventLabel(ev.narration);
  }
  
  if (ev.type === 'camera') {
    // [시뮬 C 신규] ev.target === 'user' 면 유저 mesh 를 카메라 타겟으로.
    //   저장값은 예약어 '__user__' — cinematicTarget 추적 로직이 이걸 보면
    //   npcMeshes 가 아니라 state.user.mesh 를 따라간다.
    // 기존: ev.npc 에 NPC 이름을 받음. 호환 유지.
    // [피드백 엔딩카메라 진단] 왜 e_low_s6_cam 이 야미를 안 따라가는지 파악용.
    //   실제로 cinematicTarget 이 무엇으로 세팅되는지, 대상 mesh 가 있는지 로깅.
    if (state.simulation.cameraMode === 'cinematic') {
      if (ev.target === 'user') {
        state.simulation.cinematicTarget = '__user__';
        console.log('[cam] set target: __user__ (event=' + ev.id + ')');
      } else if (ev.npc) {
        const target = state.npcs.find(n => n.name === ev.npc);
        if (target) {
          state.simulation.cinematicTarget = target.id;
          const m = npcMeshes[target.id];
          console.log('[cam] set target: ' + target.id + ' (name=' + ev.npc + ', event=' + ev.id +
            ', meshExists=' + !!m + ', visible=' + (m ? m.mesh.visible : 'n/a') +
            ', pos=' + (m ? ('(' + m.mesh.position.x.toFixed(1) + ',' + m.mesh.position.z.toFixed(1) + ')') : 'n/a') + ')');
        } else {
          console.warn('[cam] NPC name not found in state.npcs:', ev.npc);
        }
      }
    } else {
      console.log('[cam] cameraMode is not cinematic, event=' + ev.id + ' skipped');
    }
    if (ev.label) {
      // 상단 라벨은 이벤트 라벨로 덮어씌우되 앞에 ★ 표시
      setSimulationEventLabel('★ ' + ev.label);
    }
  }

  // [시뮬 C 신규] 유저 mesh 를 특정 좌표로 이동.
  //   scene.js 의 moveUserTo 함수 재사용. NPC 의 move 이벤트와 달리
  //   pendingNpcId/stopDistance 는 안 넘긴다 (엔딩 시뮬에선 특정 NPC 추적
  //   이동이 아니라 단순 지점 이동만 필요).
  //   동시에 ev.narration 이 있으면 하단 자막도 띄움 (move 와 동일).
  if (ev.type === 'moveUser' && ev.to) {
    if (typeof moveUserTo === 'function') {
      moveUserTo(ev.to.x, ev.to.z);
    }
    if (ev.narration) setSimulationEventLabel(ev.narration);
  }

  // [Wave 2 / 이슈 C] 시뮬레이션 중 NPC 머리 위 말풍선 표시.
  // [Wave 3 이슈 α] chatBubbleEl (이름표와 분리된 말풍선) 에 적용:
  //   - chatBubbleEl.textContent 로 메시지 설정
  //   - .classList.remove('hide') 로 표시
  //   - chatMessage + chatTimer 를 세팅해 지속 시간 후 자동 해제 (scene.js 가 처리)
  if (ev.type === 'bubble' && ev.npc && ev.text) {
    const target = state.npcs.find(n => n.name === ev.npc);
    if (target && npcMeshes[target.id]) {
      const mesh = npcMeshes[target.id];
      if (mesh.chatBubbleEl) {
        mesh.chatBubbleEl.textContent = ev.text;
        mesh.chatBubbleEl.classList.remove('hide');
      }
      mesh.chatMessage = ev.text;
      mesh.chatTimer = ev.duration || 5; // 기본 5초 지속
    }
  }
  
  // [시뮬 B 신규] NPC 를 특정 좌표에 등장시킴.
  //   - mesh.visible = true
  //   - npc.location = 'outside' (낮 스케줄러와 동기화)
  //   - speechBubbleEl 노출
  //   - 필요시 position 강제 세팅
  // [시뮬 B 신규] NPC 를 특정 좌표에 등장시킴.
  //   - mesh.visible = true
  //   - npc.location = 'outside' (낮 스케줄러와 동기화)
  //   - speechBubbleEl 노출
  //   - 필요시 position 강제 세팅
  //   - [시뮬 A 추가] 이동 상태 리셋 — 텔레포트 후 이전 targetPos 방향으로 계속 걷는 걸 방지
  // 주의: 이 상태로 시뮬 끝나면 endSimulation 안전망에서 homeLocation 으로 복원됨.
  if (ev.type === 'show' && ev.npc) {
    const target = state.npcs.find(n => n.name === ev.npc);
    if (target && npcMeshes[target.id]) {
      const m = npcMeshes[target.id];
      if (ev.position) {
        m.mesh.position.set(ev.position.x, 0, ev.position.z);
      }
      m.mesh.visible = true;
      if (m.speechBubbleEl) m.speechBubbleEl.classList.remove('hide');
      target.location = 'outside';
      // 이전 스케줄러/자유 이동 상태 전부 리셋
      m.state = 'idle';
      m.targetPos = null;
      m.scriptedTarget = null;
      m.idleTimer = 99; // 시뮬 동안 스스로 방황 안 시작하도록 큰 값
    }
  }

  // [시뮬 B 신규] NPC 를 사라지게 함.
  //   - mesh.visible = false
  //   - npc.location = homeLocation (원상복구)
  //   - speechBubbleEl / chatBubbleEl 둘 다 숨김
  if (ev.type === 'hide' && ev.npc) {
    const target = state.npcs.find(n => n.name === ev.npc);
    if (target && npcMeshes[target.id]) {
      const m = npcMeshes[target.id];
      m.mesh.visible = false;
      if (m.speechBubbleEl) m.speechBubbleEl.classList.add('hide');
      if (m.chatBubbleEl) m.chatBubbleEl.classList.add('hide');
      target.location = target.homeLocation || 'outside';
    }
  }

  // [시뮬 B 신규] 시뮬 도중 증거 팝업.
  //   - sim.paused = true 로 시간 정지
  //   - pausedAt 기록 → 재개 시 startTime 보정
  //   - 팝업 닫기 버튼에 hook 을 걸어 재개 트리거
  if (ev.type === 'evidence' && ev.assetKey) {
    showEvidencePopupInSim(ev.assetKey, ev.caption || '');
  }

  if (ev.type === 'end') {
    endSimulation();
  }
}

// 매 프레임 호출 — 시뮬레이션 중 스크립트 체크 + 카메라 추적
function runSimulationTick(dt) {
  const sim = state.simulation;
  if (!sim.active) return;
  // [시뮬 B 신규] evidence 이벤트로 인한 일시정지 중에는 시간·이벤트·카메라 모두 정지.
  // pausedAt 은 showEvidencePopupInSim 이 기록해 두고 재개 시 startTime 보정에 사용.
  if (sim.paused) return;
  
  // 1) 시간 흐름
  state.timeOfDay += dt * 0.015 * sim.speed;

  // [Wave 3 이슈 β] 시뮬레이션 중 timeOfDay 가 1.0 을 넘어 wrap 되면
  // 새벽/아침 범위(0.15~0.4) 로 떨어져 scene.js 조명이 하늘을 밝게 칠해버림.
  // → 시뮬 내내 "한밤" 조명 유지하도록 wrap 시 0.0 ~ 0.12 사이로 유지.
  // [시뮬 C/A 수정] 단, 이 wrap/clamp 는 night 모드일 때만 적용.
  //              ending/cutscene 모드는 낮 조명을 유지해야 하므로 timeOfDay 를 건드리지 않는다.
  const isDayMode = (sim.mode === 'ending' || sim.mode === 'cutscene');
  if (!isDayMode) {
    if (state.timeOfDay >= 1) {
      state.timeOfDay = state.timeOfDay - 1;
      if (state.timeOfDay > 0.12) state.timeOfDay = 0.10;
    }
  }

  // 시뮬레이션 중에는 phase 를 무조건 'night' 로 고정.
  // NIGHT_SCRIPTS 가 가상 시간으로 1.06~1.48 까지 돌 수 있어서 phase 판정이 꼬이는 것 방지.
  // [시뮬 C/A 수정] night 모드에서만 phase 강제. ending/cutscene 모드는 낮 그대로 유지.
  if (!isDayMode) {
    state.phase = 'night';
  }

  // phase 라벨 업데이트 (모드별 분기)
  const phaseLabel = document.getElementById('sim-phase-label');
  if (phaseLabel) {
    if (sim.mode === 'ending')       phaseLabel.textContent = '✨ 엔딩';
    else if (sim.mode === 'cutscene') phaseLabel.textContent = '🎬 장면';
    else                              phaseLabel.textContent = '🌙 밤';
  }

  // 2) 스크립트 이벤트 체크
  // [시뮬 C/A 수정] mode 에 따라 소스 스크립트와 virtualTime 기준이 다르다.
  //   - night:    NIGHT_SCRIPTS[state.day]. virtualTime = 0.74 + elapsedSec * 0.015 * speed
  //               (at 값이 0.74 미만이면 다음날로 해석해 +1)
  //   - ending:   ENDING_SCRIPTS[sim.endingBranch]. virtualTime = elapsedSec * 0.015 * speed
  //               (at 값은 0 부터 시작)
  //   - cutscene: CUTSCENE_SCRIPTS[sim.cutsceneId]. 기준은 ending 과 동일.
  let script;
  let virtualTime;
  const elapsedSec = (performance.now() - sim.startTime) / 1000;
  if (sim.mode === 'ending') {
    script = ENDING_SCRIPTS[sim.endingBranch] || [];
    virtualTime = elapsedSec * 0.015 * sim.speed;
  } else if (sim.mode === 'cutscene') {
    script = CUTSCENE_SCRIPTS[sim.cutsceneId] || [];
    virtualTime = elapsedSec * 0.015 * sim.speed;
  } else {
    script = NIGHT_SCRIPTS[state.day] || [];
    virtualTime = 0.74 + elapsedSec * 0.015 * sim.speed;
  }

  for (const ev of script) {
    // night 모드에서 ev.at 이 0.74 보다 작으면 다음날(+1) 로 해석.
    // ending/cutscene 모드는 모든 at 이 0 이상이므로 그대로 사용.
    const evTime = (!isDayMode && ev.at < 0.74) ? ev.at + 1 : ev.at;
    if (virtualTime >= evTime && !sim.eventsFired.has(ev.id)) {
      sim.eventsFired.add(ev.id);
      fireScriptEvent(ev);
    }
  }

  // 3) 시네마틱 카메라 추적 (cinematicTarget이 있을 때 부드럽게 따라감)
  // [시뮬 C 수정] cinematicTarget === '__user__' 면 유저 mesh 를 따라간다.
  if (sim.cameraMode === 'cinematic' && sim.cinematicTarget != null) {
    let targetMesh = null;
    if (sim.cinematicTarget === '__user__') {
      targetMesh = state.user && state.user.mesh ? state.user.mesh : null;
    } else {
      const m = npcMeshes[sim.cinematicTarget];
      targetMesh = m ? m.mesh : null;
    }
    if (targetMesh) {
      // cameraTarget을 NPC/유저 위치로 부드럽게 lerp
      cameraTarget.x += (targetMesh.position.x - cameraTarget.x) * dt * 2;
      cameraTarget.z += (targetMesh.position.z - cameraTarget.z) * dt * 2;
      // 거리도 살짝 줄여서 가까이 (18 정도)
      cameraDist += (18 - cameraDist) * dt * 1.5;
      updateCamera();
    }
  }
}

// 시뮬레이션 종료 — 페이드 아웃 → 집 복귀 → 다음날 아침
// [시뮬 C 수정] mode 가 'ending' 이면 아침으로 넘어가지 않고 낮 자유 탐색으로 복귀.
function endSimulation() {
  const sim = state.simulation;
  if (!sim.active) return;

  // [시뮬 C] mode 를 로컬에 캡처 — 아래에서 sim.mode 를 리셋한 뒤에도 분기 판단 가능하게.
  const endedMode = sim.mode;

  sim.active = false;
  sim.cinematicTarget = null;

  // [시뮬 A 안전망] cutscenePending 해제 (에러 경로에서 남아있을 경우 대비).
  state.cutscenePending = false;

  // [시뮬 B 신규] 안전망: paused 상태에서 스킵 버튼을 눌렀거나, evidence 팝업이 열린
  // 상태로 end 이벤트가 들어온 경우 정리.
  sim.paused = false;
  sim.pausedAt = 0;
  // evidence 팝업 닫기
  const evMod = document.getElementById('evidence-modal');
  if (evMod) evMod.classList.remove('show');
  // 시뮬 중 show 로 꺼내진 NPC 중 원래 집이 있는 애들 location 복원.
  (state.npcs || []).forEach(npc => {
    if (
      npc.homeLocation &&
      npc.homeLocation !== 'outside' &&
      npc.location === 'outside'
    ) {
      const m = npcMeshes[npc.id];
      if (m) {
        npc.location = npc.homeLocation;
        if (m.speechBubbleEl) m.speechBubbleEl.classList.add('hide');
        if (m.chatBubbleEl) m.chatBubbleEl.classList.add('hide');
        m.mesh.visible = false;
      }
    }
  });

  // NPC들의 scriptedTarget 해제
  Object.values(npcMeshes).forEach(n => { n.scriptedTarget = null; });
  // [시뮬 C 신규] 유저 이동도 멈춤 (ending 모드에서 moveUser 를 쓴 경우 대비).
  if (state.user) {
    state.user.moving = false;
    state.user.targetPos = null;
    state.user.onArrive = null;
    state.user.pendingNpcId = null;
  }

  hideSimulationUI();

  // [시뮬 C] mode 별 종료 경로 분기.
  if (endedMode === 'ending') {
    // 엔딩 시뮬 종료 — 페이드 후 엔딩 post-effects(팝업/호감도) 실행하고 낮으로 복귀.
    fadeToBlack(1000, () => {
      // 카메라 기본 위치로
      cameraAngle = Math.PI / 4;
      cameraPitch = Math.PI / 3.5;
      cameraDist = 30;
      cameraTarget.set(0, 0, 0);
      updateCamera();

      // 엔딩 post-effects 실행 (changeAffinity 등). showStoryModal / showEvidencePopup
      // 은 scenarios/bookstore.js 에서 이미 제거되어 effects 안에 없다.
      if (typeof runEndingPostEffects === 'function') {
        runEndingPostEffects();
      }

      // mode 리셋
      sim.mode = 'night';
      sim.endingBranch = null;

      // 페이드 인 (낮 자유 탐색 복귀)
      setTimeout(() => fadeFromBlack(1200), 300);
    });
    return;
  }

  // [시뮬 A] cutscene 종료 — 페이드 후 followUp effects + 대화창 자동 오픈.
  if (endedMode === 'cutscene') {
    fadeToBlack(800, () => {
      // 카메라 복원
      cameraAngle = Math.PI / 4;
      cameraPitch = Math.PI / 3.5;
      cameraDist = 30;
      cameraTarget.set(0, 0, 0);
      updateCamera();

      // followUp effects 실행 (addRumor, changeAffinity, injectNpcContext, npcSpeaksFirst 등)
      // 그리고 대화창 자동 오픈.
      if (typeof runCutscenePostEffects === 'function') {
        runCutscenePostEffects();
      }

      // mode 리셋
      sim.mode = 'night';
      sim.cutsceneId = null;

      // 페이드 인 (낮 자유 탐색 복귀)
      setTimeout(() => fadeFromBlack(800), 200);
    });
    return;
  }

  // 기존 night 시뮬 종료 경로 — 페이드 아웃 → advanceToNightAndMorning → 페이드 인.
  fadeToBlack(1200, () => {
    state.user.isSleeping = false;

    // 카메라 기본 위치로
    cameraAngle = Math.PI / 4;
    cameraPitch = Math.PI / 3.5;
    cameraDist = 30;
    cameraTarget.set(0, 0, 0);
    updateCamera();

    // 기존 advanceToNightAndMorning을 호출해서 리포트/퀘스트 생성 로직이 실행되게 함.
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
// [시뮬 B 신규] 시뮬 도중에 뜨는 증거 팝업.
// =========================================================
// 일반 showEvidencePopup 과의 차이:
//   1. 시뮬 일시정지 트리거 (sim.paused=true, pausedAt 기록)
//   2. __closeEvidence 를 임시로 wrap 해서 "닫기 누르면 시뮬 재개" 로직 추가
//   3. 재개 시 startTime 을 보정하여 "정지 동안 경과한 실제 시간" 을
//      가상 시각에 누적하지 않도록 함 (안 하면 재개 직후 이벤트 여러 개가
//      한꺼번에 발동됨).
//
// 안전 장치:
//   - 이미 paused 상태면 덮어쓰지 않고 바로 return (중복 호출 방어)
//   - 이미지 에셋이 없으면(assetRegistry 미등록) 팝업 자체가 뜨지 않으므로
//     paused 걸린 채 영영 안 풀릴 위험 있음 → 그 경우는 일시정지 자체를 안 건다.
function showEvidencePopupInSim(assetKey, caption) {
  const sim = state.simulation;

  // 이미지 없으면 notification 만 뜨고 팝업 DOM 이 열리지 않음 → 재개 훅을 못 걸게 되므로
  // 일시정지를 걸지 않고 notification 만 띄우고 끝낸다.
  const img = assetRegistry[assetKey];
  if (!img) {
    showEvidencePopup(assetKey, caption); // 내부에서 notification 경로 처리
    return;
  }

  // 중복 호출 방어 — 이미 paused 상태면 새로 안 건다.
  if (sim.paused) {
    showEvidencePopup(assetKey, caption); // 팝업만 띄움
    return;
  }

  // 1) 일시정지 트리거
  sim.paused = true;
  sim.pausedAt = performance.now();

  // 2) 팝업 표시
  showEvidencePopup(assetKey, caption);

  // 3) 닫기 핸들러 wrap — 기존 핸들러 호출 후 시뮬 재개
  const originalClose = window.__closeEvidence;
  window.__closeEvidence = function() {
    try { originalClose(); } catch (e) { /* ignore */ }
    // 닫기 핸들러 복원 (다음 팝업을 위해)
    window.__closeEvidence = originalClose;
    // 시뮬 재개
    if (sim.pausedAt) {
      sim.startTime += performance.now() - sim.pausedAt;
      sim.pausedAt = 0;
    }
    sim.paused = false;
  };
}

// =========================================================
// 제타 스타일 팝업 채팅
// =========================================================
let zetaCurrentNpcId = null;

function detectEmotion(text, npcId) {
  // AI 응답에서 감정 추출 (대괄호 태그 또는 키워드)
  // [Tier 1 #13] 파이프(|)가 섞인 태그도 허용. 예: [감정:thinking|sad]
  //              이 경우 맨 앞 감정만 사용 (AI 가 여러 개를 찍는 버그 대응).
  const tagMatch = text.match(/\[감정:([a-z|]+)\]/i);
  if (tagMatch) {
    const first = tagMatch[1].split('|')[0].trim().toLowerCase();
    if (first) return first;
  }
  
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

  // [Wave 1] scripted 메시지(npcSpeaksFirst effect 로 삽입된 것) 감지.
  // source === 'scripted' 이고 유저가 아직 UI 에서 보지 못한 것들만 골라서 표시.
  // 한 번 UI 에 노출되면 shown 플래그 세팅 → 다음 openZeta 에선 "이전 대화 N건" 에 포함.
  const unseenScripted = history.filter(m => m.role === 'npc' && m.source === 'scripted' && !m.shown);

  // 분기 조건:
  //   (a) history 비어있음                    → 첫 만남 인사말
  //   (b) unseenScripted 존재                 → "상황이 달라졌다" 인디케이터 + 해당 메시지들만 UI 렌더
  //   (c) 그 외                              → "이전 대화 N건" 시스템 메시지 (이전 UI 재현 없음)

  if (history.length === 0) {
    // (a) 첫 만남
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
    history = [{ role: 'npc', text: greeting, emotion: 'natural', shown: true }];
    state.chatHistory[npcId] = history;

    // UI 렌더
    const emotion = 'natural';
    appendInlineEmotionCard(npcId, emotion, messagesEl);
    const greetMsg = document.createElement('div');
    greetMsg.className = 'zeta-msg npc';
    greetMsg.textContent = greeting;
    messagesEl.appendChild(greetMsg);
    state.chatHistory[`_emotion_${npcId}`] = emotion;
  } else if (unseenScripted.length > 0) {
    // (b) scripted 메시지가 새로 삽입됨 — 상황 변화 있음.
    // 이전 대화 건수 안내 (scripted 이전까지의 대화 카운트) + scripted 메시지 UI 렌더.
    const priorCount = history
      .filter(m => (m.role === 'user' || m.role === 'npc') && m.source !== 'scripted')
      .length;
    if (priorCount > 0) {
      const sys = document.createElement('div');
      sys.className = 'zeta-msg system';
      sys.textContent = `(이전 대화 ${priorCount}건 — ${npc.name}는 이전 이야기를 기억하고 있어요)`;
      messagesEl.appendChild(sys);
    }
    // scripted 메시지들을 시간 순서대로 (history 내 등장 순서) UI 에 렌더 + shown 마킹
    let prevEmotion = state.chatHistory[`_emotion_${npcId}`] || null;
    history.forEach(m => {
      if (m.role === 'npc' && m.source === 'scripted' && !m.shown) {
        const emotion = m.emotion || 'natural';
        if (emotion !== prevEmotion) {
          appendInlineEmotionCard(npcId, emotion, messagesEl);
          prevEmotion = emotion;
        }
        const msg = document.createElement('div');
        msg.className = 'zeta-msg npc';
        msg.textContent = m.text;
        messagesEl.appendChild(msg);
        m.shown = true; // 이후 openZeta 에선 "이전 대화 N건" 에 포함
      }
    });
    if (prevEmotion) state.chatHistory[`_emotion_${npcId}`] = prevEmotion;
  } else {
    // (c) 단순 재방문. 이전 UI 재현 없이 카운트만.
    const msgCount = history.filter(m => m.role === 'user' || m.role === 'npc').length;
    const sys = document.createElement('div');
    sys.className = 'zeta-msg system';
    sys.textContent = `(이전 대화 ${msgCount}건 — ${npc.name}는 이전 이야기를 기억하고 있어요)`;
    messagesEl.appendChild(sys);
  }
  
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

  // [Tier 진단 #16] 대화창 닫힘 경로 로그
  console.log('[Q#00] __closeZeta 호출. closingNpcId=' + closingNpcId +
              ', closingHistory.length=' + closingHistory.length +
              ', hasEngine=' + !!window.scenarioEngine +
              ', hasFn=' + !!(window.scenarioEngine && window.scenarioEngine.evaluateQuestMilestones));

  document.getElementById('zeta-chat').classList.remove('show');
  zetaCurrentNpcId = null;

  if (closingNpcId && closingHistory.length > 0
      && window.scenarioEngine
      && typeof window.scenarioEngine.evaluateQuestMilestones === 'function') {
    console.log('[Q#00b] evaluateQuestMilestones 호출 예정...');
    // fire-and-forget. 판정 끝나면 배너 갱신 트리거.
    window.scenarioEngine.evaluateQuestMilestones(closingNpcId, closingHistory)
      .then(function (result) {
        console.log('[Q#24] evaluateQuestMilestones 완료. result=', result);
        if (result && result.newlyAchievedDetails && result.newlyAchievedDetails.length > 0) {
          console.log('[Q#25] 마일스톤 신규 달성:', result.newlyAchieved);
          // [9단계] 구체적 알림 — 어떤 마일스톤이 달성됐는지 명시.
          // 여러 개 동시 달성되면 순차 표시 (각각 3.5초).
          result.newlyAchievedDetails.forEach(function (m, i) {
            setTimeout(function () {
              showNotification('✨ 달성: ' + m.description);
            }, i * 3500);
          });
        } else {
          console.log('[Q#25b] 신규 달성 없음 (newlyAchievedDetails 비어있음)');
        }
        // 배너 갱신 (정의돼 있으면)
        if (typeof renderQuestBanner === 'function') {
          try { renderQuestBanner(); } catch (e) { /* ignore */ }
        }
        // 퀘스트 해결됐으면 UI 전반 갱신
        if (result && result.resolved) {
          console.log('[Q#26] 퀘스트 해결됨 → renderContent/renderCounts 호출');
          if (typeof renderContent === 'function') { try { renderContent(); } catch(e){} }
          if (typeof renderCounts === 'function')  { try { renderCounts(); } catch(e){} }
        } else {
          // [Tier 진단 #16] 퀘스트 해결 아니어도 renderContent 호출해봄 — 진행도 UI 갱신 확인용
          if (typeof renderContent === 'function') {
            console.log('[Q#26b] 해결은 아님. 진행도 UI 갱신 위해 renderContent 호출');
            try { renderContent(); } catch(e){}
          }
        }
      })
      .catch(function (err) {
        console.error('[Q#27] evaluateQuestMilestones 실패 (무시):', err);
      });
  } else {
    // [Tier 진단 #16] 분기 탄 이유 진단
    console.warn('[Q#00c] evaluateQuestMilestones 호출 건너뜀. 이유:',
                 !closingNpcId ? 'closingNpcId 없음' :
                 closingHistory.length === 0 ? '대화 로그 비어있음' :
                 !window.scenarioEngine ? 'scenarioEngine 없음' :
                 'evaluateQuestMilestones 함수 없음');
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
  
  // [Tier 2 #4] 타이핑 점 세 개 → 스피너(돌아가는 원) 로 교체.
  //   사용자 요청: "생각 중" 느낌을 점보다 더 명확히. 스피너 + 작은 텍스트.
  const typing = document.createElement('div');
  typing.className = 'zeta-spinner';
  typing.innerHTML = '<div class="zeta-spinner-ring"></div><div class="zeta-spinner-text">생각 중…</div>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  try {
    state.loading = true;
    // [8단계 제거] NPC별 storyStage 기반 하드코딩 storyContext 블록 삭제.
    //              엔진의 getDialogueContext 가 전담 (아래 systemFinal 조립부).
    // 감정 태그 지시사항만 isStory NPC 대상으로 유지 (이건 대화 포맷 규칙이라 엔진 밖에 있어야 맞음).
    const emotionDirective = npc.isStory
      // [Tier 1 #13] "|"를 여러 개 고르라는 뜻으로 오해하지 않도록 문구 강화.
      //              반드시 한 개만, 다른 문법 금지.
      ? '\n\n답변 끝에 [감정:XXX] 태그를 정확히 한 번 붙여. XXX 는 natural / happy / sad / surprised / angry / thinking 중 **정확히 하나만** 고른다. 여러 개를 파이프(|) 나 콤마로 나열하지 마라. 예: "그건 말이지... [감정:angry]"'
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
    // [피드백 2번 수정] 최근 대화 윈도우 6턴 → 12턴.
    // 이유: "얌쿤이라고 부를게" 같은 유저 선언이 6턴 밖으로 밀리면 AI가 바로 잊음.
    // MEM_HISTORY_THRESHOLD(20)까지는 요약이 생성되지 않으므로 중간 구간(7~20턴)이 블랙홀이었음.
    // 12턴으로 늘려 이 구간을 커버. 임계치는 그대로 유지해 AI 호출 비용은 안 늘어남.
    const messagesArr = history.slice(-12).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const rawResponse = await callClaude(systemFinal, messagesArr);
    
    // 감정 태그 제거한 깨끗한 응답
    // [Tier 1 #13] 파이프(|)가 섞인 태그도 함께 제거. 예: [감정:thinking|sad]
    const cleanResponse = rawResponse.replace(/\[감정:[a-z|]+\]/gi, '').trim();
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
