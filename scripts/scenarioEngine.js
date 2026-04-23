// =========================================================
// 시나리오 엔진 (뼈대)
// =========================================================
//
// 설계 4단계 / 8단계 계획 중 "2단계: 엔진 뼈대" 산출물.
//
// ⚠️ 중요: 이 파일은 "뼈대"다.
//   - 엔진 상태 객체 정의
//   - 시나리오 로드
//   - 5개 작업의 "스텁 함수" (console.log만)
//   - 어떤 기존 코드(state.js / gameplay.js / scene.js)도 아직 엔진을 호출하지 않는다.
//   - 즉, 이 파일을 추가해도 게임 동작은 "완전히 동일"해야 한다.
//
// 로드 순서(index.html):
//   data.js → scenarios/bookstore.js → scenarioEngine.js → state.js → ...
//   (bookstore.js 다음, state.js 이전)
//
// 전역 노출: window.scenarioEngine
//
// 3단계 이후 계획:
//   3단계: runNightSimulation(작업 4) 실제 구현
//   4단계: AI 호출 묶음(batch)
//   5단계: checkStageTransition / manageActiveEvents(작업 1, 2) 실제 구현
//   6단계: handleNpcApproach(작업 3) 실제 구현 (gameplay.js 연결)
//   7단계: getDialogueContext(작업 5) 실제 구현 (state.js 연결)
//   8단계: gameplay.js의 advanceToNightAndMorning 완전 교체
// =========================================================

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────
  // 1. 로드 시점 검증 (의존성 체크)
  // ─────────────────────────────────────────────────────
  // bookstore.js 가 먼저 로드돼서 window.BOOKSTORE_SCENARIO 가 있어야 한다.
  // 없으면 엔진은 동작할 수 없으므로 에러를 남기고 조용히 종료.
  if (!window.BOOKSTORE_SCENARIO) {
    console.error(
      '[engine] BOOKSTORE_SCENARIO 가 로드되지 않았습니다. ' +
      'index.html 에서 scenarios/bookstore.js 가 scenarioEngine.js 보다 먼저 로드되는지 확인하세요.'
    );
    return;
  }


  // ─────────────────────────────────────────────────────
  // 2. 엔진 상태 객체
  // ─────────────────────────────────────────────────────
  // 엔진이 기억해야 할 모든 것. 설계 문서 5.4절 기반.
  // 이 상태는 state.js 의 state 객체와는 "독립"이다 (8단계까지 병행 존재).
  const engineState = {
    // 현재 로드된 시나리오 객체 (loadScenario 호출 시 채워짐)
    scenario: null,

    // 현재 시나리오 단계 ('dormant' | 'triggered' | 'quest_active' | 'resolved')
    // 시나리오의 initialStage 로 초기화됨.
    currentStage: null,

    // 완료된 낮 이벤트 ID 집합 (예: 'chaka_shows_night_photo')
    // Set 을 쓰는 이유: 중복 없이 빠르게 has() 체크.
    completedEvents: new Set(),

    // 현재 활성화된 낮 이벤트 배열 (preconditions 만족 + 아직 미완료)
    // 5단계에서 manageActiveEvents 가 채움.
    activeEvents: [],

    // 잠든 총 횟수 (Q1 결정사항: 절대값)
    // 단계 전환 조건 sleptAtLeast 비교용.
    sleepCount: 0,

    // 해결된 퀘스트 ID 집합 (예: 'yami_dream_crisis')
    resolvedQuests: new Set(),

    // 기타 플래그 저장소 (엔딩 분기 key 등)
    // 예: { bookstore_ending_route: 'high' }
    flags: {},

    // NPC별 임시 대화 배경 주입 저장소
    // 키: npcId, 값: 주입된 문자열
    // 설계 질문 5.3 의 제안대로 "단계 전환 시 초기화" → transitionStage 에서 비움.
    injectedContext: {},
  };


  // ─────────────────────────────────────────────────────
  // 3. 시나리오 로드
  // ─────────────────────────────────────────────────────
  // 엔진에 시나리오를 장착하고 상태를 초기 단계로 리셋한다.
  // 지금은 서점 시나리오 하나뿐이지만 향후 다른 시나리오도 이 함수로 교체 가능.
  function loadScenario(scenario) {
    if (!scenario || !scenario.id) {
      console.error('[engine] loadScenario: 유효한 시나리오 객체가 아님', scenario);
      return false;
    }

    engineState.scenario = scenario;
    engineState.currentStage = scenario.initialStage || 'dormant';
    engineState.completedEvents.clear();
    engineState.activeEvents = [];
    engineState.sleepCount = 0;
    engineState.resolvedQuests.clear();
    engineState.flags = {};
    engineState.injectedContext = {};

    console.log(
      '[engine] scenario loaded:',
      scenario.id,
      '(initial stage:', engineState.currentStage + ')'
    );
    return true;
  }


  // ─────────────────────────────────────────────────────
  // 4. 5개 작업의 스텁 함수
  // ─────────────────────────────────────────────────────
  // 전부 console.log 만 하고 실제 동작은 안 한다.
  // 지금은 아무도 이 함수들을 호출하지 않는다 — 기존 코드와 연결은 3~8단계에서.


  // 작업 1: 단계 전환 체크
  // 언제 호출: 유저가 일어날 때 (state.js endSimulation)
  // 현재 단계의 transitions.conditions 를 확인해 다음 단계로 전환할지 결정.
  function checkStageTransition() {
    console.log(
      '[engine][stub] checkStageTransition 호출됨. ' +
      'currentStage=' + engineState.currentStage +
      ', sleepCount=' + engineState.sleepCount +
      ' (5단계에서 실제 구현 예정)'
    );
    return null; // 실제 구현 시 전환된 새 단계명(or null) 반환
  }

  // 작업 2: 낮 이벤트 활성화 관리
  // 언제 호출: 단계 진입 시 + 이벤트 완료 시
  // 현재 단계의 dayEvents 중 preconditions 를 만족하는 것만 activeEvents 에 올린다.
  function manageActiveEvents() {
    console.log(
      '[engine][stub] manageActiveEvents 호출됨. ' +
      'currentStage=' + engineState.currentStage +
      ' (5단계에서 실제 구현 예정)'
    );
  }

  // 작업 3: NPC 접근 시 이벤트 발동
  // 언제 호출: 유저가 NPC에게 3m 내로 접근했을 때 (gameplay.js 에서)
  // 해당 NPC에 연결된 활성 이벤트가 있으면 effects 순차 실행.
  function handleNpcApproach(npcId) {
    console.log(
      '[engine][stub] handleNpcApproach 호출됨. npcId=' + npcId +
      ' (6단계에서 실제 구현 예정)'
    );
  }

  // 작업 4: 밤 시뮬레이션
  // 언제 호출: 유저가 잠들 때 (state.js handleBedClick 등)
  // 현재 단계의 nightSeeds 를 AI 호출 묶음으로 재생성하고 effects 실행.
  // async 로 시그니처만 잡아둠 — 실제 구현 시 AI 호출을 await 해야 하므로.
  async function runNightSimulation() {
    console.log(
      '[engine][stub] runNightSimulation 호출됨. ' +
      'currentStage=' + engineState.currentStage +
      ' (3~4단계에서 실제 구현 예정)'
    );
    return { reports: [] }; // 실제 구현 시 리포트/소문 등을 담은 결과 반환
  }

  // 작업 5: 대화 컨텍스트 주입
  // 언제 호출: 유저가 NPC와 대화 시작할 때 (state.js __zetaSend 또는 gameplay.js)
  // 해당 NPC의 base + 현재 단계 배경 + injectedContext 를 조합해 문자열로 반환.
  function getDialogueContext(npcId) {
    console.log(
      '[engine][stub] getDialogueContext 호출됨. npcId=' + npcId +
      ' (7단계에서 실제 구현 예정)'
    );
    return ''; // 실제 구현 시 AI 프롬프트에 붙일 배경 문자열 반환
  }


  // ─────────────────────────────────────────────────────
  // 5. 전역 노출
  // ─────────────────────────────────────────────────────
  // window.scenarioEngine 으로 접근 가능.
  // 구조: 상태는 읽기 쉽게 그대로 노출, 함수들도 붙여둔다.
  window.scenarioEngine = {
    // 상태 (디버깅/검증용. 외부에서 함부로 건드리지 말 것)
    state: engineState,

    // 편의 getter
    get scenario()     { return engineState.scenario; },
    get currentStage() { return engineState.currentStage; },

    // 함수들
    loadScenario:         loadScenario,
    checkStageTransition: checkStageTransition,
    manageActiveEvents:   manageActiveEvents,
    handleNpcApproach:    handleNpcApproach,
    runNightSimulation:   runNightSimulation,
    getDialogueContext:   getDialogueContext,
  };


  // ─────────────────────────────────────────────────────
  // 6. 자동 초기화
  // ─────────────────────────────────────────────────────
  // 페이지 로드 시점에 bookstore 시나리오를 자동 장착.
  // 향후 다른 시나리오를 쓰고 싶으면 여기를 바꾸거나 외부에서 loadScenario 재호출.
  loadScenario(window.BOOKSTORE_SCENARIO);

  console.log('[engine] initialized');

})();
