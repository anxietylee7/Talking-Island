// =========================================================
// 시나리오 엔진
// =========================================================
//
// 설계 4단계 / 8단계 계획 진행 상황:
//   [2단계 완료] 엔진 뼈대 (상태 객체 + 5개 작업 스텁)
//   [3단계 완료] runNightSimulation(작업 4) 실제 구현 (씨앗별 개별 호출)
//   [4단계 스킵] AI 호출 묶음 - 필요 시 돌아와서 추가
//   [5단계 완료] checkStageTransition / manageActiveEvents (작업 1, 2) 실제 구현
//                + effect 타입 4개 추가 (showStoryModal/addRumor/injectNpcContext/setFlag)
//                + autoOnStageEnter 이벤트 자동 발동
//   [6단계 완료] handleNpcApproach(작업 3) 실제 구현
//                + triggerQuest effect 실제 구현 (호감도 기반 branch 선택)
//                + seed effect 는 경고만 남기고 통과 (실제 AI 호출은 7단계)
//                + gameplay.js selectNpc 시작부에 엔진 호출 1줄 추가
//                + UI 팝업/모달 큐 매니저 추가 (동시 호출 시 순차 표시)
//                  * showEvidencePopup / showStoryModal 이 큐 경유로 변경
//                  * state.js 의 __closeEvidence / __closeStoryModal 을 wrap 해서
//                    사용자가 닫을 때마다 다음 항목 표시. state.js 자체는 무수정.
//   [7단계 완료] getDialogueContext(작업 5) 실제 구현
//                + seed effect 실제 AI 호출 (비동기, Q4=A). 결과는 seedReports 에 저장
//                + engineState.seedReports 신규 필드 (단계 전환 시 초기화)
//                + _generateDistortionLine 신규 (_generateSceneLine 과 별개, truth/distortion 활용)
//                + state.js __zetaSend 에서 getDialogueContext concat (Q1=C, 기존 하드코딩 유지)
//                + gameplay.js sendChatMessage 에서 getDialogueContext concat (Q1=C)
//   [8단계 완료] advanceToNightAndMorning 완전 교체 + 기존 하드코딩 제거
//                + ending effect 구현 (endings[branchKey].branches 분기)
//                + submitQuestAction 스토리 분기 제거 → resolvedQuests + checkStageTransition 호출로 대체
//                + state.storyStage 필드 제거, 참조 9곳 전부 정리 (엔진 currentStage 로 일원화)
//                + state.js 의 NIGHT_SCRIPTS 는 NPC 시네마틱 스크립트였으므로 유지 (v3 부채 1번 오분류)
//                + state.js __zetaSend 키워드 증거 팝업 3블록 제거
//                + ASSET_SLOTS/ASSET_META 에서 bamtol_ledger, book_reservation_slip 제거
//                + storyContext 하드코딩 전부 제거 (엔진 getDialogueContext 가 전담)
//                + _transitionStage 의 manageActiveEvents 중복은 중복이 아님 (v3 부채 8번 오분류). 주석만 명확화.
//
// ✅ 현재 상태 (8단계 완료): 엔진이 게임 메인 플로우 전체와 연결됨.
//    - selectNpc → handleNpcApproach (6단계)
//    - __zetaSend / sendChatMessage → getDialogueContext (7단계)
//    - advanceToNightAndMorning → runNightSimulation + checkStageTransition (8단계)
//    - submitQuestAction → resolvedQuests + checkStageTransition (8단계)
//    기존 storyStage 하드코딩, 증거 팝업 체인, 에필로그 분기 등은 전부 시나리오 데이터 기반으로 이동.
//
// 로드 순서(index.html):
//   data.js → scenarios/bookstore.js → scenarioEngine.js → state.js → ...
//
// 전역 노출: window.scenarioEngine
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

    // [7단계 추가] seed effect AI 가 비동기로 생성한 장면 저장소
    // 구조: { npcId: [{ seedId, line, generatedAt }] }
    // 어느 NPC 의 "최근 일어난 일"인지 추적 — seed 정의에 targetNpcIds 필드로 지정.
    // 단계 전환 시 초기화 (오래된 장면이 다음 단계까지 새어나가지 않게).
    seedReports: {},

    // [9단계 추가] 퀘스트별 달성된 마일스톤 추적
    // 구조: { questId: Set<milestoneId> }
    // evaluateQuestMilestones 가 대화창 닫을 때마다 AI 판정 결과로 채움.
    // 퀘스트 해결 시에도 유지됨 (엔딩 분기 판정 등에서 참고 가능).
    questMilestones: {},
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
    engineState.seedReports = {};
    engineState.questMilestones = {};

    console.log(
      '[engine] scenario loaded:',
      scenario.id,
      '(initial stage:', engineState.currentStage + ')'
    );

    // 초기 단계의 낮 이벤트들 활성화
    manageActiveEvents();
    // 초기 단계에 autoOnStageEnter 이벤트가 있으면 즉시 발동
    // (bookstore.js 기준: dormant 에는 없음. 안전 장치로만.)
    _fireAutoOnStageEnterEvents();

    return true;
  }


  // ─────────────────────────────────────────────────────
  // 4. 5개 작업의 스텁 함수
  // ─────────────────────────────────────────────────────
  // 전부 console.log 만 하고 실제 동작은 안 한다.
  // 지금은 아무도 이 함수들을 호출하지 않는다 — 기존 코드와 연결은 3~8단계에서.


  // 작업 1: 단계 전환 체크
  // 언제 호출: 유저가 일어날 때 (8단계에서 state.js endSimulation 에 연결 예정)
  // 현재 단계의 transitions.conditions 를 AND 로 확인 → 만족하면 _transitionStage 호출.
  //
  // 반환: 전환된 새 단계명(string) 또는 null (전환 안 일어남).
  //
  // 현재 지원 조건 타입 (bookstore.js 기준 3개):
  //   - sleptAtLeast: { type, count }         → engineState.sleepCount >= count
  //   - requiredDayEventDone: { type, eventId }→ completedEvents 에 eventId 포함
  //   - questResolved: { type, questId }      → resolvedQuests 에 questId 포함
  function checkStageTransition() {
    const scenario = engineState.scenario;
    const stage    = engineState.currentStage;
    if (!scenario) return null;

    const transition = scenario.transitions && scenario.transitions[stage];
    if (!transition) {
      // resolved 처럼 전환 정의 자체가 없는 최종 상태
      return null;
    }

    const conds = transition.conditions || [];
    // 모든 조건(AND) 평가. 하나라도 false 면 전환 X.
    for (const cond of conds) {
      if (!_evalTransitionCondition(cond)) {
        console.log(
          '[engine] checkStageTransition: ' + stage + ' 조건 미충족',
          cond
        );
        return null;
      }
    }

    // 모든 조건 충족 → 단계 전환
    console.log('[engine] checkStageTransition: ' + stage + ' → ' + transition.to);
    return _transitionStage(transition.to);
  }

  // 조건 평가 (단일 조건 하나를 받아 boolean 반환)
  function _evalTransitionCondition(cond) {
    if (!cond || !cond.type) return false;
    switch (cond.type) {
      case 'sleptAtLeast':
        return engineState.sleepCount >= (cond.count || 0);

      case 'requiredDayEventDone':
        return engineState.completedEvents.has(cond.eventId);

      case 'questResolved':
        return engineState.resolvedQuests.has(cond.questId);

      default:
        console.warn('[engine] 알 수 없는 transition 조건 타입:', cond.type);
        return false;
    }
  }

  // 단계 전환 실제 수행 (Q3 답변: 자동 부수효과 O)
  // - currentStage 변경
  // - injectedContext 초기화 (설계 질문 5.3)
  // - 새 단계 낮 이벤트 활성화
  // - 새 단계의 autoOnStageEnter 이벤트 즉시 실행 (Q4 답변)
  function _transitionStage(newStage) {
    engineState.currentStage = newStage;
    engineState.injectedContext = {};
    engineState.seedReports = {}; // [7단계] 다음 단계로 오래된 장면 새지 않게 초기화
    console.log('[engine] stage transitioned to:', newStage);

    // 새 단계 낮 이벤트 활성화 + autoOnStageEnter 이벤트 즉시 실행.
    // _fireAutoOnStageEnterEvents 가 끝에서 manageActiveEvents 를 다시 호출하므로
    // 여기서 manageActiveEvents 를 먼저 부를 필요 없다.
    // (v2 5.9 부채 / v4 8단계 Phase A 정리)
    // 단, _fireAutoOnStageEnterEvents 는 activeEvents 기준으로 돌기 때문에 먼저
    // manageActiveEvents 를 한 번 호출해서 새 단계의 activeEvents 를 채워줘야 한다.
    manageActiveEvents();
    _fireAutoOnStageEnterEvents();

    return newStage;
  }


  // 작업 2: 낮 이벤트 활성화 관리
  // 언제 호출: 단계 진입 시 (자동) + 이벤트 완료 시 (6단계에서)
  // 현재 단계의 dayEvents 중에서:
  //   - 이미 completedEvents 에 있으면 제외
  //   - preconditions 를 만족하면 activeEvents 에 추가
  // activeEvents 를 새로 덮어쓴다.
  function manageActiveEvents() {
    const scenario = engineState.scenario;
    const stage    = engineState.currentStage;
    if (!scenario) {
      engineState.activeEvents = [];
      return;
    }

    const events = (scenario.dayEvents && scenario.dayEvents[stage]) || [];
    const active = [];
    for (const ev of events) {
      if (engineState.completedEvents.has(ev.id)) continue; // 이미 완료
      if (_evalPreconditions(ev.preconditions)) {
        active.push(ev);
      }
    }
    engineState.activeEvents = active;
    console.log(
      '[engine] manageActiveEvents: stage=' + stage +
      ', active=' + active.map(function (e) { return e.id; }).join(',')
    );
  }

  // preconditions 평가 (Q2 답변: all + anyOf 지원)
  // preconditions 는 배열이고, 배열의 각 원소는:
  //   - { all: [eventId, ...] }     → 전부 완료돼야 true
  //   - { anyOf: [eventId, ...] }   → 하나라도 완료되면 true
  // 배열 전체는 AND (모든 원소 절이 true 여야 함).
  // 빈 배열이면 무조건 true.
  function _evalPreconditions(preconditions) {
    if (!Array.isArray(preconditions) || preconditions.length === 0) return true;

    for (const clause of preconditions) {
      if (clause.all && Array.isArray(clause.all)) {
        for (const eventId of clause.all) {
          if (!engineState.completedEvents.has(eventId)) return false;
        }
      } else if (clause.anyOf && Array.isArray(clause.anyOf)) {
        let anyMatched = false;
        for (const eventId of clause.anyOf) {
          if (engineState.completedEvents.has(eventId)) {
            anyMatched = true;
            break;
          }
        }
        if (!anyMatched) return false;
      } else {
        console.warn('[engine] 알 수 없는 precondition 절:', clause);
        return false;
      }
    }
    return true;
  }

  // 새 단계 진입 시 autoOnStageEnter 이벤트를 즉시 실행.
  // "유저 접근 없이 자동 발동" 이벤트만 대상 (예: quest_active 의 yami_retries_bookclub).
  // dryRun 은 없음 — 단계 전환 자체가 "실제 일어난" 이벤트이므로.
  function _fireAutoOnStageEnterEvents() {
    const activeCopy = engineState.activeEvents.slice(); // 반복 중 변경 대비
    for (const ev of activeCopy) {
      if (ev.trigger && ev.trigger.type === 'autoOnStageEnter') {
        console.log('[engine] autoOnStageEnter 이벤트 발동:', ev.id);
        _applyEffects(ev.effects, { source: 'autoOnStageEnter:' + ev.id });
        engineState.completedEvents.add(ev.id);
      }
    }
    // 완료 처리됐으니 activeEvents 다시 계산 (이 이벤트에 의해 풀리는 후속 이벤트가 있을 수 있음)
    manageActiveEvents();
  }

  // 작업 3: NPC 접근 시 이벤트 발동 [6단계 구현]
  // 언제 호출: 유저가 NPC 대화를 열 때 (gameplay.js 의 selectNpc 시작부)
  //
  // 동작:
  //   1. activeEvents 중 trigger 가 이 NPC에 매칭되는 것을 찾는다.
  //      - trigger.type === 'approachNpc' && trigger.npcId === npcId   → 매칭
  //      - trigger.type === 'approachAnyNpc' && trigger.npcIds.includes(npcId) → 매칭
  //      - autoOnStageEnter 는 여기서 처리 안 함 (이미 단계 전환 시 발동됨)
  //   2. 매칭되는 이벤트가 있으면 effects 순차 실행 + completedEvents 에 추가.
  //   3. manageActiveEvents() 재호출 → 후속 이벤트 풀릴 수 있음.
  //   4. 매칭되는 게 여러 개면 전부 실행 (동시에 여러 개가 트리거 걸리는 일은 드물지만 방어적).
  //   5. 아무것도 매칭 안 되면 조용히 return (로그 1줄만).
  //
  // 반환값: 실행된 이벤트 ID 배열 (디버깅용). 없으면 빈 배열.
  //
  // 재발동 방지: completedEvents 에 추가되면 다음 manageActiveEvents 에서 자동 제외되므로
  //             같은 이벤트가 두 번 발동되지 않는다.
  function handleNpcApproach(npcId) {
    if (!npcId) {
      console.warn('[engine] handleNpcApproach: npcId 없음');
      return [];
    }
    if (!engineState.scenario) {
      console.warn('[engine] handleNpcApproach: 시나리오 미로드');
      return [];
    }

    // 현재 activeEvents 중 이 NPC에 매칭되는 것만 필터
    const matched = engineState.activeEvents.filter(function (ev) {
      const t = ev.trigger;
      if (!t) return false;
      if (t.type === 'approachNpc') {
        return t.npcId === npcId;
      }
      if (t.type === 'approachAnyNpc') {
        return Array.isArray(t.npcIds) && t.npcIds.indexOf(npcId) !== -1;
      }
      return false; // autoOnStageEnter 등 다른 타입은 여기서 다루지 않음
    });

    if (matched.length === 0) {
      // 활성 이벤트 없음 → 조용히 종료 (일상적인 경우이므로 경고 아님)
      console.log('[engine] handleNpcApproach: 활성 이벤트 없음. npcId=' + npcId);
      return [];
    }

    const firedIds = [];
    for (const ev of matched) {
      // 방어적 중복 체크: activeEvents 에 들어와 있다면 이미 completedEvents 에 없긴 하지만,
      // 같은 턴 안에서 여러 이벤트가 발동될 때 앞 이벤트의 manageActiveEvents 가 다시
      // 이 이벤트를 올릴 가능성은 없지만, 안전을 위해 체크.
      if (engineState.completedEvents.has(ev.id)) continue;

      console.log('[engine] handleNpcApproach: 이벤트 발동 →', ev.id, '(npcId=' + npcId + ')');
      _applyEffects(ev.effects, { source: 'approach:' + ev.id + ':' + npcId });
      engineState.completedEvents.add(ev.id);
      firedIds.push(ev.id);
    }

    // 후속 이벤트가 풀릴 수 있으므로 activeEvents 재계산
    manageActiveEvents();

    // [카테고리 1 신규] 이벤트가 하나라도 발동됐으면 배너 재평가 (byEventCompleted 반영)
    if (firedIds.length > 0 && typeof renderQuestBanner === 'function') {
      try { renderQuestBanner(); } catch (e) { /* ignore */ }
    }

    return firedIds;
  }

  // 작업 4: 밤 시뮬레이션
  // 언제 호출: 유저가 잠들 때 (state.js handleBedClick 등)
  // 현재 단계의 nightSeeds 를 AI 호출로 재생성하고 effects 실행.
  //
  // options:
  //   dryRun (기본 true): true면 effects 를 실행하지 않고 sleepCount 도 증가시키지 않는다.
  //                       AI 씬 생성만 수행하고 결과 객체를 반환한다.
  //                       개발/디버깅 용도로 콘솔에서 수동 호출할 때 부작용 방지.
  //                       8단계에서 gameplay.js 가 호출할 때는 { dryRun: false } 명시 필요.
  //
  // 반환 객체:
  //   {
  //     stage: string,              // 현재 단계
  //     reports: [                  // 씨앗별 생성 결과
  //       {
  //         seedId: string,
  //         sceneOriginal: string,  // bookstore.js 의 원본 scene 텍스트
  //         line: string,           // AI 가 생성한 한 줄 요약 (실패 시 원문 일부)
  //         aiFailed: boolean,      // AI 호출 실패 여부 (fallback 되었는지)
  //       }, ...
  //     ],
  //     executedEffects: [...],     // 실제 실행된 effect 목록 (dryRun 이면 빈 배열)
  //     dryRun: boolean,
  //   }
  async function runNightSimulation(options) {
    const dryRun = !options || options.dryRun !== false; // 기본 true

    const scenario = engineState.scenario;
    const stage    = engineState.currentStage;

    if (!scenario) {
      console.warn('[engine] runNightSimulation: 시나리오가 로드되지 않음');
      return { stage: null, reports: [], executedEffects: [], dryRun: dryRun };
    }

    const seeds = (scenario.nightSeeds && scenario.nightSeeds[stage]) || [];
    console.log(
      '[engine] runNightSimulation start. stage=' + stage +
      ', seeds=' + seeds.length +
      ', dryRun=' + dryRun
    );

    // ── 씨앗별 AI 호출
    // 지금은 "씨앗별 개별 호출" (옵션 A). 4단계에서 묶음(batch)으로 교체 예정.
    // 각 씨앗 호출을 순차로 돌림 (직렬). 병렬로 바꾸면 빠르지만 API 비용/부하가 몰림 —
    // 4단계에서 어차피 묶음으로 바꿀 거라 여기서는 단순하게 직렬.
    const reports = [];
    for (const seed of seeds) {
      const r = await _generateSceneLine(seed);
      reports.push(r);
    }

    // ── effects 실행
    const executedEffects = [];
    if (!dryRun) {
      for (const seed of seeds) {
        if (seed.effects && seed.effects.length) {
          const ran = _applyEffects(seed.effects, { source: 'nightSeed:' + seed.id });
          executedEffects.push.apply(executedEffects, ran);
        }
      }
      // sleepCount 증가는 "실제 실행" 때만. dryRun 으로는 상태 오염 없음.
      engineState.sleepCount += 1;
      console.log('[engine] sleepCount ->', engineState.sleepCount);
    } else {
      console.log('[engine] dryRun=true: effects 실행 및 sleepCount 증가 건너뜀');
    }

    console.log('[engine] runNightSimulation done. reports=' + reports.length);
    return {
      stage: stage,
      reports: reports,
      executedEffects: executedEffects,
      dryRun: dryRun,
    };
  }


  // ─────────────────────────────────────────────────────
  // 4-a. 내부 헬퍼: 씨앗 하나에 대한 AI 호출
  // ─────────────────────────────────────────────────────
  // callClaude(systemPrompt, userPrompt, expectJSON=false) 는 state.js 가 정의한 전역 함수.
  // 이 파일이 먼저 로드되더라도 함수 "내부"에서 호출하는 시점에는 이미 존재함.
  //
  // AI 호출 실패 시: 원본 scene 의 앞 40자를 fallback 으로 반환. 게임이 멈추지 않도록.
  async function _generateSceneLine(seed) {
    // [8단계] publicSummary 가 정의돼 있으면 AI 호출 없이 바로 사용.
    // 이유: 시나리오 작성자가 "플레이어에게 공개할 리포트 텍스트"를 직접 확정한 경우
    //       AI 가 건드리면 스포일러가 섞이거나 톤이 바뀔 수 있어 그대로 쓰는 게 가장 안전.
    //       API 호출 절약 + 결과 일관성 보장 효과.
    if (typeof seed.publicSummary === 'string' && seed.publicSummary.trim()) {
      return {
        seedId: seed.id,
        sceneOriginal: seed.scene || '',
        line: seed.publicSummary.trim(),
        aiFailed: false,
        usedPublicSummary: true,
      };
    }

    // 안전: callClaude 미존재 (state.js 로드 전) 대비
    if (typeof callClaude !== 'function') {
      console.warn('[engine] callClaude 가 아직 정의되지 않음. seed=' + seed.id);
      return {
        seedId: seed.id,
        sceneOriginal: seed.scene || '',
        line: (seed.scene || '').slice(0, 40),
        aiFailed: true,
      };
    }

    const systemPrompt =
      '너는 밤에 마을에서 일어난 장면을 기록하는 관찰자다. ' +
      '다음 규칙을 지켜라:\n' +
      '1. 한국어로 작성한다.\n' +
      '2. 주어진 장면의 중요한 사실을 빠뜨리지 말고 모두 담아라. ' +
      '원문에 나오는 행동, 사물, 장소, 우연성·부주의의 단서가 있다면 보존하라. ' +
      '짧게 만들겠다고 핵심 정보를 버리지 마라.\n' +
      '3. 주어를 분명히 써라 (예: "야미가...", "차카가...").\n' +
      '4. 담담한 관찰 톤으로 쓴다. 감정 해설, 추측, 원문에 없는 내용 추가 금지.\n' +
      '5. 원문 그대로 복사하지 말고 자연스러운 한 문단으로 다듬는다. ' +
      '문장 수 제약은 없다 (1~3문장 사이에서 자연스럽게).';

    const userPrompt =
      '다음 장면을 위 규칙대로 기록해줘.\n\n' +
      '장면: ' + seed.scene;

    try {
      const text = await callClaude(systemPrompt, userPrompt, false);
      const line = (text || '').trim();
      if (!line) throw new Error('empty response');
      return {
        seedId: seed.id,
        sceneOriginal: seed.scene || '',
        line: line,
        aiFailed: false,
      };
    } catch (err) {
      console.warn('[engine] seed AI 호출 실패, fallback 사용. seedId=' + seed.id, err);
      return {
        seedId: seed.id,
        sceneOriginal: seed.scene || '',
        line: (seed.scene || '').slice(0, 40) + '…',
        aiFailed: true,
      };
    }
  }


  // [7단계 추가] 낮 이벤트 seed 용 AI 호출.
  // _generateSceneLine 와 달리 truth/distortion 쌍을 받아서 왜곡이 일어나는 대화를 생성.
  // seedDef 형식: { scene, truth, distortion, ... }
  // 반환: { seedId, line, aiFailed }
  async function _generateDistortionLine(seedDef, seedId) {
    if (typeof callClaude !== 'function') {
      console.warn('[engine] callClaude 미정의. seedId=' + seedId);
      return { seedId: seedId, line: seedDef.distortion || seedDef.scene || '', aiFailed: true };
    }

    const systemPrompt =
      '너는 마을에서 일어난 NPC 간 대화를 기록하는 관찰자다. ' +
      '다음 규칙을 지켜라:\n' +
      '1. 한국어로 2~3문장 이내.\n' +
      '2. 주어진 장면이 어떻게 진행되는지, 그리고 그 과정에서 사실이 어떻게 왜곡되는지를 묘사한다. ' +
      '"실제 사실"과 "대화 중 왜곡된 내용"이 따로 주어지므로 둘의 차이가 드러나게 써라.\n' +
      '3. 담담한 관찰 톤. 감정 해설, 추측, 원문에 없는 인물 추가 금지.\n' +
      '4. 주어를 분명히 쓴다 (예: "차카가 말했다...", "밤톨은 듣다가...").\n' +
      '5. 원문 그대로 복사하지 말고 자연스러운 문장으로 다듬어라.';

    const userPrompt =
      '장면: ' + (seedDef.scene || '') + '\n' +
      '실제 사실: ' + (seedDef.truth || '(없음)') + '\n' +
      '대화 중 왜곡된 내용: ' + (seedDef.distortion || '(없음)') + '\n\n' +
      '위 정보를 바탕으로 장면을 기록해줘.';

    try {
      const text = await callClaude(systemPrompt, userPrompt, false);
      const line = (text || '').trim();
      if (!line) throw new Error('empty response');
      return { seedId: seedId, line: line, aiFailed: false };
    } catch (err) {
      console.warn('[engine] distortion seed AI 실패. fallback. seedId=' + seedId, err);
      return {
        seedId: seedId,
        line: seedDef.distortion || seedDef.scene || '',
        aiFailed: true,
      };
    }
  }


  // ─────────────────────────────────────────────────────
  // 4-b. 내부 헬퍼: effects 배열 실행
  // ─────────────────────────────────────────────────────
  // 설계 질문 5.2 답변대로 "배열 순서대로 실행, 중간 실패 시 경고 + 계속 진행".
  // 반환: 실제 실행된 (또는 시도된) effect 들의 로그 배열 (디버깅용).
  //
  // 지원 타입 (5단계 시점):
  //   - showEvidencePopup (assetKey, caption)     — 3단계에서 추가
  //   - changeAffinity (npcId, delta)             — 3단계에서 추가
  //   - showStoryModal (title, body)              — 5단계에서 추가
  //   - addRumor (textTemplate, aboutNpcId)       — 5단계에서 추가
  //   - injectNpcContext (npcId, text)            — 5단계에서 추가
  //   - setFlag (key, value)                       — 5단계에서 추가
  //
  // 미구현 (필요할 때 추가):
  //   - triggerQuest (6단계에서)
  //   - seed (6단계에서 낮 이벤트용 씨앗 AI 호출)
  //   - ending (8단계에서 엔딩 분기)
  //
  // 모르는 타입은 경고만 남기고 스킵.


  // ─────────────────────────────────────────────────────
  // 4.5 UI 팝업/모달 큐 매니저 [6단계 추가]
  // ─────────────────────────────────────────────────────
  // 문제 배경: state.js 의 showEvidencePopup / showStoryModal 은 단일 DOM 요소를
  //           덮어쓰는 구조라서, 한 턴에 2개 이상 연속 호출되면 앞 것이 묵살된다.
  //           예: handleNpcApproach('bamtol') 로 이벤트 2개가 동시에 발동돼
  //               증거 팝업이 총 3번 호출돼도 첫 번째만 보이는 현상.
  //
  // 해결: 엔진 내부에 큐를 두고 한 번에 하나씩 표시. 사용자가 닫으면 다음 것 표시.
  //      state.js 는 수정하지 않는다 (인계 원칙 유지). 대신 window.__closeEvidence /
  //      window.__closeStoryModal 을 감싸서(wrap) 원본 동작 + 큐 진행을 같이 한다.
  //
  // 항목 형식:
  //   { kind: 'evidence', assetKey, caption }
  //   { kind: 'story', title, body }
  //
  // 큐잉 함수는 _applyEffects 에서 showEvidencePopup / showStoryModal 케이스가 직접 호출.
  const _uiQueue = {
    items: [],      // 대기 중인 항목들
    current: null,  // 현재 표시 중인 항목 (null 이면 idle)
  };

  // 큐에 추가. 현재 아무것도 표시 중이 아니면 즉시 표시.
  function _enqueueUi(item) {
    _uiQueue.items.push(item);
    if (!_uiQueue.current) {
      _showNextUi();
    }
  }

  // 큐에서 다음 항목을 꺼내 실제 표시. 비어 있으면 idle 로.
  function _showNextUi() {
    const next = _uiQueue.items.shift();
    if (!next) {
      _uiQueue.current = null;
      return;
    }
    _uiQueue.current = next;
    try {
      if (next.kind === 'evidence') {
        if (typeof showEvidencePopup === 'function') {
          showEvidencePopup(next.assetKey, next.caption || '');
        } else {
          console.warn('[engine][ui-queue] showEvidencePopup 함수 없음');
          // 함수가 없으면 그냥 스킵하고 다음 항목으로
          _showNextUi();
        }
      } else if (next.kind === 'story') {
        if (typeof showStoryModal === 'function') {
          showStoryModal(next.title || '', next.body || '');
        } else {
          console.warn('[engine][ui-queue] showStoryModal 함수 없음');
          _showNextUi();
        }
      } else if (next.kind === 'reports') {
        // [카테고리 1 신규] Day 2 아침 "어젯밤의 소식" 팝업.
        // state.reports 배열의 모든 항목을 텍스트로 이어붙여 showStoryModal 로 표시.
        try {
          let body = next.bodyIntro ? next.bodyIntro + '\n\n' : '';
          if (typeof state !== 'undefined' && state && Array.isArray(state.reports) && state.reports.length > 0) {
            body += state.reports.map(function (r) {
              const npcName = (state.npcs.find(function (n) { return n.id === r.aboutNpcId; }) || {}).name
                              || (r.npcName || '');
              const prefix = npcName ? '📋 ' + npcName + ': ' : '📋 ';
              return prefix + (r.publicSummary || r.text || '(내용 없음)');
            }).join('\n\n');
          } else {
            body += '(특별한 소식은 없었어요.)';
          }
          if (typeof showStoryModal === 'function') {
            showStoryModal(next.title || '📜 어젯밤의 소식', body);
          } else {
            _showNextUi();
          }
        } catch (err) {
          console.error('[engine][ui-queue] reports 렌더 에러:', err);
          _showNextUi();
        }
      } else {
        console.warn('[engine][ui-queue] 알 수 없는 kind:', next.kind);
        _showNextUi();
      }
    } catch (err) {
      console.error('[engine][ui-queue] 표시 중 에러, 다음 항목으로 진행:', err);
      _showNextUi();
    }
  }

  // state.js 의 닫기 함수를 감싼다 (wrap).
  // 원본이 이미 존재해야 감쌀 수 있으므로, state.js 로드 후에 호출해야 한다.
  // setTimeout(0) 으로 현재 실행 스택 비운 뒤에 바인딩해서 state.js 로드를 기다림.
  function _installCloseHooks() {
    const origCloseEvidence = window.__closeEvidence;
    const origCloseStory    = window.__closeStoryModal;

    if (typeof origCloseEvidence === 'function') {
      window.__closeEvidence = function () {
        try { origCloseEvidence.apply(this, arguments); }
        catch (e) { console.error('[engine][ui-queue] origCloseEvidence 에러:', e); }
        // 증거 모달을 닫았고 현재 큐 항목이 evidence 면 다음으로 진행
        if (_uiQueue.current && _uiQueue.current.kind === 'evidence') {
          _uiQueue.current = null;
          _showNextUi();
        }
      };
    } else {
      console.warn('[engine][ui-queue] window.__closeEvidence 없음 (state.js 로드 전?)');
    }

    if (typeof origCloseStory === 'function') {
      window.__closeStoryModal = function () {
        try { origCloseStory.apply(this, arguments); }
        catch (e) { console.error('[engine][ui-queue] origCloseStory 에러:', e); }
        // story 또는 reports 큐 항목이면 다음 큐로 진행
        if (_uiQueue.current && (_uiQueue.current.kind === 'story' || _uiQueue.current.kind === 'reports')) {
          _uiQueue.current = null;
          _showNextUi();
        }
      };
    } else {
      console.warn('[engine][ui-queue] window.__closeStoryModal 없음 (state.js 로드 전?)');
    }
  }

  // 엔진 로드 시점에는 아직 state.js 가 실행 전일 수 있다.
  // index.html 의 <script> 순서는 scenarioEngine.js → state.js 이기 때문.
  // DOMContentLoaded 를 기다려서 감싸기 설치.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installCloseHooks);
  } else {
    // 이미 로드 완료 상태면 다음 틱에 설치 (state.js 가 같은 턴에 실행 중일 수 있음)
    setTimeout(_installCloseHooks, 0);
  }


  function _applyEffects(effects, context) {
    const log = [];
    if (!Array.isArray(effects)) return log;

    for (const fx of effects) {
      try {
        switch (fx.type) {

          case 'showEvidencePopup':
            // [6단계 변경] 직접 호출 대신 큐에 넣음 (동시 발동 시 순차 표시 보장).
            _enqueueUi({ kind: 'evidence', assetKey: fx.assetKey, caption: fx.caption || '' });
            log.push({ type: fx.type, assetKey: fx.assetKey, status: 'queued' });
            break;

          case 'changeAffinity':
            // state.npcs 배열에서 해당 NPC 찾아 affinity 수정 (0~100 클램프).
            if (typeof state !== 'undefined' && state && Array.isArray(state.npcs)) {
              const npc = state.npcs.find(function (n) { return n.id === fx.npcId; });
              if (npc) {
                const before = npc.affinity || 0;
                npc.affinity = Math.max(0, Math.min(100, before + (fx.delta || 0)));
                log.push({
                  type: fx.type, npcId: fx.npcId,
                  before: before, after: npc.affinity, status: 'ok'
                });
                // NPC 목록 UI 갱신 (함수가 있으면)
                if (typeof renderNpcList === 'function') {
                  try { renderNpcList(); } catch (e) { /* ignore */ }
                }
              } else {
                console.warn('[engine][effect] changeAffinity: NPC 못 찾음', fx.npcId);
                log.push({ type: fx.type, npcId: fx.npcId, status: 'npc_not_found' });
              }
            } else {
              console.warn('[engine][effect] state.npcs 접근 불가');
              log.push({ type: fx.type, status: 'skipped_no_state' });
            }
            break;

          case 'showStoryModal':
            // [6단계 변경] 직접 호출 대신 큐에 넣음 (동시 발동 시 순차 표시 보장).
            _enqueueUi({ kind: 'story', title: fx.title || '', body: fx.body || '' });
            log.push({ type: fx.type, title: fx.title, status: 'queued' });
            break;

          case 'moveNpc':
            // [카테고리 1 신규] NPC 를 특정 좌표로 순간이동시킨다.
            // 씬 쪽 spawnNpcMesh / npcMeshes 를 건드려야 하므로 scene.js 의 헬퍼에 위임.
            // 헬퍼가 없으면 state.npcs[i].location 만 업데이트 (폴백).
            if (fx.npcId && fx.to && typeof fx.to.x === 'number' && typeof fx.to.z === 'number') {
              let moved = false;
              try {
                if (typeof window !== 'undefined' && typeof window.__teleportNpc === 'function') {
                  window.__teleportNpc(fx.npcId, fx.to.x, fx.to.z);
                  moved = true;
                }
              } catch (e) { console.warn('[engine][effect] moveNpc 헬퍼 에러:', e); }
              log.push({ type: fx.type, npcId: fx.npcId, to: fx.to, status: moved ? 'ok' : 'no_helper' });
            } else {
              log.push({ type: fx.type, status: 'invalid' });
            }
            break;

          case 'showReportsModal':
            // [카테고리 1 신규] 현재 state.reports 전체를 한 번에 모달로 보여준다.
            // (리포트 탭과 별개. 아침 진입 직후 "어젯밤의 소식" 팝업용.)
            // UI 큐에 넣어 다른 팝업들과 순서 경쟁 없게.
            _enqueueUi({
              kind: 'reports',
              title: fx.title || '📜 어젯밤의 소식',
              bodyIntro: fx.bodyIntro || '',
            });
            log.push({ type: fx.type, status: 'queued' });
            break;

          case 'addRumor':
            // state.rumors 에 푸시. 기존 구조 참조: {id, day, aboutNpcId, text, isStory}
            if (typeof state !== 'undefined' && state && Array.isArray(state.rumors)) {
              const rumor = {
                id: Date.now() + Math.random(),
                day: state.day || 1,
                aboutNpcId: fx.aboutNpcId || null,
                text: fx.textTemplate || fx.text || '',
                isStory: true,
                source: 'engine',
              };
              state.rumors.push(rumor);
              log.push({ type: fx.type, aboutNpcId: fx.aboutNpcId, status: 'ok' });
              // 소문 탭 UI 갱신
              if (typeof renderContent === 'function') {
                try { renderContent(); } catch (e) { /* ignore */ }
              }
              if (typeof renderCounts === 'function') {
                try { renderCounts(); } catch (e) { /* ignore */ }
              }
            } else {
              console.warn('[engine][effect] state.rumors 접근 불가');
              log.push({ type: fx.type, status: 'skipped_no_state' });
            }
            break;

          case 'injectNpcContext':
            // 엔진 내부 상태만 변경. 실제 주입은 7단계 getDialogueContext 에서.
            // 설계 질문 5.3 답변대로 "단계 전환 시 초기화" → _transitionStage 에서 비움.
            if (fx.npcId && typeof fx.text === 'string') {
              engineState.injectedContext[fx.npcId] = fx.text;
              log.push({ type: fx.type, npcId: fx.npcId, status: 'ok' });
            } else {
              console.warn('[engine][effect] injectNpcContext: npcId 또는 text 누락', fx);
              log.push({ type: fx.type, status: 'invalid' });
            }
            break;

          case 'setFlag':
            // 엔진 flags 에 저장. 엔딩 분기 등에서 읽힘.
            if (fx.key) {
              engineState.flags[fx.key] = (fx.value !== undefined) ? fx.value : true;
              log.push({ type: fx.type, key: fx.key, status: 'ok' });
            } else {
              log.push({ type: fx.type, status: 'invalid' });
            }
            break;

          case 'triggerQuest':
            // [6단계 구현] 시나리오의 quests[questId] 정의를 읽어 state.quests 에 추가.
            // 야미의 현재 호감도를 보고 branches 중 적절한 것을 선택한다.
            {
              const questId = fx.questId;
              const scenario = engineState.scenario;
              if (!questId || !scenario || !scenario.quests || !scenario.quests[questId]) {
                console.warn('[engine][effect] triggerQuest: quest 정의 없음', questId);
                log.push({ type: fx.type, questId: questId, status: 'quest_not_found' });
                break;
              }
              const questDef = scenario.quests[questId];

              // 이미 발동된 퀘스트면 중복 방지
              if (typeof state !== 'undefined' && state && Array.isArray(state.quests)) {
                const exists = state.quests.some(function (q) { return q.id === questId; });
                if (exists) {
                  console.log('[engine][effect] triggerQuest: 이미 발동된 퀘스트', questId);
                  log.push({ type: fx.type, questId: questId, status: 'already_triggered' });
                  break;
                }
              }

              // branches 순회하며 조건에 맞는 것 선택 (type:'default' 는 최종 fallback)
              let chosenBranch = null;
              if (Array.isArray(questDef.branches)) {
                for (const br of questDef.branches) {
                  if (!br.condition) continue;
                  const c = br.condition;
                  if (c.type === 'affinityGte') {
                    const targetNpc = (state && state.npcs) ?
                      state.npcs.find(function (n) { return n.id === c.npcId; }) : null;
                    const aff = targetNpc ? (targetNpc.affinity || 0) : 0;
                    if (aff >= (c.value || 0)) { chosenBranch = br; break; }
                  } else if (c.type === 'default') {
                    chosenBranch = br;
                    break;
                  }
                }
                // 아무것도 안 맞으면 첫 번째 branch 로 fallback
                if (!chosenBranch && questDef.branches.length > 0) {
                  chosenBranch = questDef.branches[questDef.branches.length - 1];
                }
              }

              if (!chosenBranch) {
                console.warn('[engine][effect] triggerQuest: 적합한 branch 없음', questId);
                log.push({ type: fx.type, questId: questId, status: 'no_branch' });
                break;
              }

              // state.quests 에 추가 (기존 gameplay.js 구조 참조)
              if (typeof state !== 'undefined' && state && Array.isArray(state.quests)) {
                const questObj = {
                  id: questId,
                  npcId: questDef.targetNpcId,
                  day: state.day || 1,
                  situation: chosenBranch.situation || '',
                  resolved: false,
                  result: null,
                  isStory: true,
                  affinityRoute: chosenBranch.key,
                };
                state.quests.push(questObj);
                log.push({
                  type: fx.type, questId: questId,
                  branch: chosenBranch.key, status: 'ok'
                });
                console.log('[engine][effect] triggerQuest 발동:', questId, '(branch=' + chosenBranch.key + ')');
                // UI 갱신
                if (typeof renderContent === 'function') {
                  try { renderContent(); } catch (e) { /* ignore */ }
                }
                if (typeof renderCounts === 'function') {
                  try { renderCounts(); } catch (e) { /* ignore */ }
                }
              } else {
                console.warn('[engine][effect] triggerQuest: state.quests 접근 불가');
                log.push({ type: fx.type, status: 'skipped_no_state' });
              }
            }
            break;

          case 'seed':
            // [7단계 구현] 비동기 AI 호출로 왜곡 장면 생성.
            // 결과는 engineState.seedReports 에 저장되어 getDialogueContext 가 후속 대화에서 활용.
            // 이 effect 는 await 하지 않는다 (Q4=A 비동기 결정). 즉시 다른 effects 로 진행.
            // 실패해도 다른 effects 에 영향 없음.
            {
              const seedId = fx.seedId;
              const scenario = engineState.scenario;
              const seedDef = scenario && scenario.eventSeeds ? scenario.eventSeeds[seedId] : null;
              if (!seedDef) {
                console.warn('[engine][effect] seed: 정의 없음', seedId);
                log.push({ type: fx.type, seedId: seedId, status: 'seed_not_found' });
                break;
              }
              // 대상 NPC 목록: seed 정의에 targetNpcIds 있으면 사용, 없으면 context.source 에서 추측하지 말고
              // 시나리오 작성자가 명시하도록 강제 (지금 bookstore.js 의 distortion_seed 는 targetNpcIds 없음 → 기본값 사용)
              const targetNpcIds = Array.isArray(seedDef.targetNpcIds) && seedDef.targetNpcIds.length > 0
                ? seedDef.targetNpcIds
                : ['chaka', 'bamtol', 'yami']; // 기본값: 주요 스토리 NPC 3명
              console.log('[engine][effect] seed 비동기 시작:', seedId, '→ NPCs:', targetNpcIds);
              log.push({ type: fx.type, seedId: seedId, status: 'started_async', targetNpcIds: targetNpcIds });

              // Fire-and-forget: 결과는 나중에 seedReports 에 들어감.
              _generateDistortionLine(seedDef, seedId)
                .then(function (result) {
                  if (!result || !result.line) return;
                  const report = {
                    seedId: seedId,
                    line: result.line,
                    generatedAt: Date.now(),
                  };
                  for (const nid of targetNpcIds) {
                    if (!engineState.seedReports[nid]) engineState.seedReports[nid] = [];
                    engineState.seedReports[nid].push(report);
                  }
                  console.log('[engine][effect] seed 완료:', seedId, '→ line:', result.line);
                })
                .catch(function (err) {
                  // 실패해도 게임 진행에 영향 없음 (다른 effects 는 이미 실행됨)
                  console.warn('[engine][effect] seed 실패 (무시):', seedId, err);
                });
            }
            break;

          case 'ending':
            // [8단계 구현] 시나리오의 endings[branchKey] 를 읽어 조건 맞는 branch 의 effects 실행.
            // 현재 bookstore.js 의 resolved 단계 ending_scene 이벤트에서 사용.
            // branch 선택 규칙은 triggerQuest 와 동일:
            //   - condition.type === 'affinityGte' → 해당 NPC 호감도 비교
            //   - condition.type === 'default'     → fallback
            //   - 아무것도 안 맞으면 마지막 branch 사용
            {
              const branchKey = fx.branchKey;
              const scenario = engineState.scenario;
              if (!branchKey || !scenario || !scenario.endings || !scenario.endings[branchKey]) {
                console.warn('[engine][effect] ending: 정의 없음', branchKey);
                log.push({ type: fx.type, branchKey: branchKey, status: 'ending_not_found' });
                break;
              }
              const endingDef = scenario.endings[branchKey];

              let chosen = null;
              if (Array.isArray(endingDef.branches)) {
                for (const br of endingDef.branches) {
                  if (!br.condition) continue;
                  const c = br.condition;
                  if (c.type === 'affinityGte') {
                    const targetNpc = (state && state.npcs) ?
                      state.npcs.find(function (n) { return n.id === c.npcId; }) : null;
                    const aff = targetNpc ? (targetNpc.affinity || 0) : 0;
                    if (aff >= (c.value || 0)) { chosen = br; break; }
                  } else if (c.type === 'default') {
                    chosen = br;
                    break;
                  }
                }
                if (!chosen && endingDef.branches.length > 0) {
                  chosen = endingDef.branches[endingDef.branches.length - 1];
                }
              }

              if (!chosen) {
                console.warn('[engine][effect] ending: 적합 branch 없음', branchKey);
                log.push({ type: fx.type, branchKey: branchKey, status: 'no_branch' });
                break;
              }

              console.log('[engine][effect] ending 분기 선택:', branchKey, '→', chosen.key);
              // flags 에도 기록 (나중에 분석/디버그용)
              engineState.flags[branchKey + '_selected'] = chosen.key;

              // 선택된 branch 의 effects 를 재귀 실행
              if (Array.isArray(chosen.effects)) {
                _applyEffects(chosen.effects, {
                  source: 'ending:' + branchKey + ':' + chosen.key
                });
              }
              log.push({
                type: fx.type, branchKey: branchKey,
                selectedBranch: chosen.key, status: 'ok'
              });
            }
            break;

          default:
        }
      } catch (err) {
        console.error('[engine][effect] 실행 중 에러 (계속 진행):', fx, err);
        log.push({ type: fx.type, status: 'error', error: String(err) });
      }
    }
    return log;
  }

  // 작업 5: 대화 컨텍스트 주입 [7단계 구현]
  // 언제 호출: state.js 의 __zetaSend, gameplay.js 의 sendChatMessage 가
  //            callClaude 호출 직전에 호출해서 AI 프롬프트에 concat 한다.
  //
  // 반환값: AI 프롬프트에 붙일 문자열. 아무것도 없으면 빈 문자열.
  //
  // 조합 규칙 (bookstore.js 의 npcDialogueContext 기반):
  //   1) npcDialogueContext[npcId].base           — 항상 포함
  //   2) npcDialogueContext[npcId].stages[currentStage] — 현재 단계 배경
  //   3) engineState.injectedContext[npcId]       — 낮 이벤트로 쌓인 임시 배경 (단계 전환 시 비워짐)
  //   4) engineState.seedReports[npcId]          — 비동기 seed AI 가 생성한 왜곡 장면 (준비된 것만)
  //
  // 빈 섹션은 자동으로 생략. 섹션 간 \n 로 구분.
  // 시나리오 정의가 없거나 NPC가 시나리오에 안 올라와 있으면 빈 문자열 반환 (일반 NPC 케이스).
  function getDialogueContext(npcId) {
    if (!npcId) return '';
    const scenario = engineState.scenario;
    if (!scenario || !scenario.npcDialogueContext) return '';

    const def = scenario.npcDialogueContext[npcId];
    if (!def) return ''; // 일반 NPC (솜이, 루루 등)는 시나리오에 안 올라와 있음 → 빈 문자열

    const parts = [];

    // 1) base
    if (def.base) parts.push(def.base);

    // 2) 현재 단계 배경
    const stageText = def.stages ? (def.stages[engineState.currentStage] || '') : '';
    if (stageText) parts.push(stageText);

    // 3) 낮 이벤트로 쌓인 임시 배경
    const inj = engineState.injectedContext[npcId];
    if (inj) parts.push(inj);

    // 4) seed 가 비동기로 생성한 왜곡 장면 (도착한 것만)
    // seedReports 는 npcId 별 배열. 해당 NPC 에 관련된 장면만 누적.
    const reports = engineState.seedReports[npcId];
    if (Array.isArray(reports) && reports.length > 0) {
      // 너무 오래된 것은 잘라서 최근 3개만 주입 (프롬프트 폭발 방지)
      const recent = reports.slice(-3).map(function (r) { return r.line; }).filter(Boolean);
      if (recent.length > 0) {
        parts.push('[최근 일어난 일] ' + recent.join(' '));
      }
    }

    if (parts.length === 0) return '';
    // 호출자가 기존 프롬프트 뒤에 그냥 concat 하기 좋게 앞에 구분 \n\n 추가.
    return '\n\n[시나리오 엔진 제공 배경]\n' + parts.join('\n');
  }


  // ─────────────────────────────────────────────────────
  // 작업 6: 퀘스트 마일스톤 판정 [9단계 구현]
  // ─────────────────────────────────────────────────────
  // 언제 호출: zeta 대화창을 닫을 때 (state.js __closeZeta 에서 호출).
  // 뭘 하나:
  //   1. 현재 활성 스토리 퀘스트(state.quests 중 isStory && !resolved) 찾기
  //   2. 각 퀘스트의 milestones 중 "이 NPC 와의 대화에서 달성 가능(applicableNpcs)"한 것만 필터
  //   3. 이미 달성된 것(engineState.questMilestones[questId])은 제외
  //   4. 남은 것 있으면 AI 호출로 대화 로그 분석 → 어떤 마일스톤이 달성됐는지 JSON 응답
  //   5. 달성된 건 questMilestones 에 추가
  //   6. 누적 개수가 resolveThreshold 이상이면 퀘스트 resolved = true
  //      + engineState.resolvedQuests 에 추가 + checkStageTransition 호출
  //
  // 인자:
  //   npcId: 방금 대화한 NPC 의 id
  //   dialogueLog: [{role, text}, ...] — 최근 대화 로그 (보통 최근 10턴 정도)
  //
  // 반환 (Promise):
  //   {
  //     questId: string | null,
  //     newlyAchieved: [milestoneId, ...],  // 이번에 새로 달성된 것들
  //     totalAchieved: number,               // 누적 개수
  //     threshold: number,
  //     resolved: boolean,                   // 이번 판정으로 퀘스트가 해결됐는가
  //   }
  //   해당되는 퀘스트 없으면 { questId: null }.
  //
  // 실패 시: console.warn 후 빈 결과 반환 (게임 진행엔 영향 없음).
  async function evaluateQuestMilestones(npcId, dialogueLog) {
    const scenario = engineState.scenario;
    if (!scenario || !scenario.quests) return { questId: null, newlyAchieved: [] };
    if (typeof state === 'undefined' || !state || !Array.isArray(state.quests)) {
      return { questId: null, newlyAchieved: [] };
    }

    // 1. 활성 스토리 퀘스트 찾기 (현재는 하나만 동시에 활성이라고 가정)
    const activeQuest = state.quests.find(function (q) {
      return q && q.isStory && !q.resolved;
    });
    if (!activeQuest) {
      console.log('[engine] evaluateQuestMilestones: 활성 스토리 퀘스트 없음');
      return { questId: null, newlyAchieved: [] };
    }

    const questDef = scenario.quests[activeQuest.id];
    if (!questDef || !Array.isArray(questDef.milestones) || questDef.milestones.length === 0) {
      console.log('[engine] evaluateQuestMilestones: 퀘스트 정의에 milestones 없음');
      return { questId: activeQuest.id, newlyAchieved: [] };
    }

    // 2. 이 NPC 와의 대화에서 달성 가능한 마일스톤만 필터
    const alreadyAchieved = engineState.questMilestones[activeQuest.id] || new Set();
    const candidates = questDef.milestones.filter(function (m) {
      if (alreadyAchieved.has(m.id)) return false;
      if (!Array.isArray(m.applicableNpcs) || m.applicableNpcs.indexOf(npcId) === -1) return false;
      return true;
    });

    if (candidates.length === 0) {
      console.log('[engine] evaluateQuestMilestones: 이 NPC(' + npcId + ')로 달성 가능한 남은 마일스톤 없음');
      return { questId: activeQuest.id, newlyAchieved: [], totalAchieved: alreadyAchieved.size,
               threshold: questDef.resolveThreshold || 0, resolved: false };
    }

    // 3. 대화 로그가 너무 빈약하면 판정 스킵 (AI 낭비 방지)
    if (!Array.isArray(dialogueLog) || dialogueLog.length === 0) {
      return { questId: activeQuest.id, newlyAchieved: [], totalAchieved: alreadyAchieved.size,
               threshold: questDef.resolveThreshold || 0, resolved: false };
    }
    const userTurnCount = dialogueLog.filter(function (m) { return m.role === 'user'; }).length;
    if (userTurnCount === 0) {
      console.log('[engine] evaluateQuestMilestones: 유저 발화 없음 → 판정 스킵');
      return { questId: activeQuest.id, newlyAchieved: [], totalAchieved: alreadyAchieved.size,
               threshold: questDef.resolveThreshold || 0, resolved: false };
    }

    // 4. AI 호출
    if (typeof callClaude !== 'function') {
      console.warn('[engine] evaluateQuestMilestones: callClaude 미정의');
      return { questId: activeQuest.id, newlyAchieved: [] };
    }

    // 대화 로그를 문자열로 (user/assistant 구분)
    const npcName = (state.npcs.find(function (n) { return n.id === npcId; }) || {}).name || npcId;
    const convoStr = dialogueLog.slice(-10).map(function (m) {
      const who = m.role === 'user' ? '유저' : npcName;
      return who + ': ' + m.text;
    }).join('\n');

    const candidatesStr = candidates.map(function (m, i) {
      return (i + 1) + '. id="' + m.id + '": ' + m.triggerCondition;
    }).join('\n');

    const systemPrompt =
      '너는 게임 대화 분석기다. 유저와 NPC 의 대화 로그를 읽고, ' +
      '주어진 "마일스톤 조건" 중 어느 것이 이 대화에서 달성됐는지 판정한다.\n' +
      '규칙:\n' +
      '1. **대화 로그 전체를 처음부터 끝까지 다시 평가한다.** 이전에 어떻게 판정했는지는 무관하다. ' +
      '과거 유저 발화도 최신 발화와 동등하게 고려한다. 같은 말이라도 문맥이 쌓였다면 나중에 인정될 수 있다.\n' +
      '2. 조건을 엄격하되 일관되게 평가한다. 유저가 표현한 의미가 조건에 부합하면 짧거나 반말이어도 인정한다. ' +
      '예를 들어 "억울하겠네", "억울하징", "네 말이 맞다" 는 모두 공감 표현으로 간주한다.\n' +
      '3. 유저가 직접 말한 내용 기준으로 판정. NPC가 알아서 한 말은 마일스톤이 아니다.\n' +
      '4. 반드시 JSON 형식으로만 답한다. 다른 텍스트 금지.\n' +
      '5. 달성된 마일스톤이 하나도 없으면 achieved 배열을 빈 배열([])로.\n' +
      '6. 같은 대화 로그를 여러 번 평가해도 같은 결과가 나와야 한다 (일관성).';

    const userPrompt =
      '대화 로그 (유저 = 플레이어, ' + npcName + ' = NPC):\n' + convoStr + '\n\n' +
      '평가할 마일스톤 조건 (이 NPC 와의 대화에서 달성 가능한 것만):\n' + candidatesStr + '\n\n' +
      '답 형식:\n' +
      '{\n' +
      '  "achieved": ["달성된_마일스톤_id", ...],\n' +
      '  "reason": "간단한 판정 이유 한 줄"\n' +
      '}';

    let aiResult = null;
    try {
      // [9단계 수정] temperature 0.2 로 낮춰 판정 일관성 확보.
      // (NPC 답변 생성은 여전히 0.85 유지 — 창의성 필요)
      aiResult = await callClaude(systemPrompt, userPrompt, true, { temperature: 0.2 });
    } catch (err) {
      console.warn('[engine] evaluateQuestMilestones: AI 호출 실패 (무시)', err);
      return { questId: activeQuest.id, newlyAchieved: [], totalAchieved: alreadyAchieved.size,
               threshold: questDef.resolveThreshold || 0, resolved: false };
    }

    const achieved = (aiResult && Array.isArray(aiResult.achieved)) ? aiResult.achieved : [];
    console.log('[engine] evaluateQuestMilestones 결과:', achieved, '사유:', aiResult && aiResult.reason);

    // 5. 달성된 것 questMilestones 에 추가 (candidates 에 있던 것만 받아들임 — AI 가 이상한 id 만들어낼 수도 있어서)
    const validIds = {};
    const candidateById = {};
    candidates.forEach(function (m) { validIds[m.id] = true; candidateById[m.id] = m; });
    const newlyAchieved = [];
    const newlyAchievedDetails = []; // [9단계] { id, description } 형태 — UI 알림에서 사용
    if (!engineState.questMilestones[activeQuest.id]) {
      engineState.questMilestones[activeQuest.id] = new Set();
    }
    const targetSet = engineState.questMilestones[activeQuest.id];
    for (const mid of achieved) {
      if (validIds[mid] && !targetSet.has(mid)) {
        targetSet.add(mid);
        newlyAchieved.push(mid);
        newlyAchievedDetails.push({
          id: mid,
          description: (candidateById[mid] && candidateById[mid].description) || mid,
        });
      }
    }

    // 6. threshold 검사
    const threshold = questDef.resolveThreshold || questDef.milestones.length;
    const totalAchieved = targetSet.size;
    let resolved = false;
    if (totalAchieved >= threshold) {
      activeQuest.resolved = true;
      activeQuest.result = {
        narrative: '오해가 서서히 풀리기 시작했어요.',
        resultLabel: '퀘스트 해결',
        // 기존 3축 필드는 0으로 채움 (UI 호환용; 기존 렌더링에서 NaN 방지)
        dreamAxis: 'forward', dreamDelta: 0,
        rumorAxis: 'resolve',
        affinityDelta: 0,
      };
      engineState.resolvedQuests.add(activeQuest.id);
      resolved = true;
      console.log('[engine] ⭐ 퀘스트 해결!', activeQuest.id, '(마일스톤', totalAchieved, '/', threshold, ')');

      // 단계 전환 체크 (quest_active → resolved 로 가면 ending_scene autoOnStageEnter 발동됨)
      try {
        checkStageTransition();
      } catch (err) {
        console.error('[engine] evaluateQuestMilestones: checkStageTransition 에러', err);
      }
    }

    return {
      questId: activeQuest.id,
      newlyAchieved: newlyAchieved,
      newlyAchievedDetails: newlyAchievedDetails, // [9단계] { id, description } 배열
      totalAchieved: totalAchieved,
      threshold: threshold,
      resolved: resolved,
    };
  }


  // ─────────────────────────────────────────────────────
  // 작업 7: 현재 퀘스트 배너 텍스트 반환 [9단계 구현]
  // ─────────────────────────────────────────────────────
  // 언제 호출: UI 가 배너를 렌더링할 때 (단계 전환 후, 대화창 닫은 후, 밤 지난 후 등)
  //
  // 선택 규칙:
  //   1. scenario.questBanners[currentStage] 를 가져옴 (없으면 빈 반환)
  //   2. 현재 활성 스토리 퀘스트의 달성된 마일스톤 수를 계산
  //   3. byMilestoneCount 에 해당 개수 키가 있으면 그 텍스트 사용
  //   4. 아니면 default 텍스트 사용
  //
  // 반환:
  //   {
  //     text: string,           // 배너 표시 텍스트 ('' 이면 숨김 권장)
  //     achieved: number,       // 달성된 마일스톤 수 (UI 진행도 표시용)
  //     threshold: number,      // 필요 마일스톤 수
  //     questId: string | null, // 활성 스토리 퀘스트 id (없으면 null)
  //   }
  function getCurrentBannerText() {
    const scenario = engineState.scenario;
    const stage = engineState.currentStage;
    const empty = { text: '', achieved: 0, threshold: 0, questId: null };
    if (!scenario || !scenario.questBanners) return empty;

    const stageBanners = scenario.questBanners[stage];
    if (!stageBanners) return empty;

    // 활성 스토리 퀘스트 + 달성 개수
    let achieved = 0;
    let threshold = 0;
    let questId = null;
    try {
      if (typeof state !== 'undefined' && state && Array.isArray(state.quests)) {
        const q = state.quests.find(function (x) { return x && x.isStory && !x.resolved; });
        if (q) {
          questId = q.id;
          const set = engineState.questMilestones[q.id];
          achieved = set ? set.size : 0;
          const qdef = scenario.quests && scenario.quests[q.id];
          threshold = (qdef && qdef.resolveThreshold) || 0;
        }
      }
    } catch (err) { /* ignore */ }

    // 텍스트 선택: 
    //   우선순위 1. byEventCompleted 에 매칭되는 완료 이벤트가 있으면 그 텍스트 [카테고리 1 신규]
    //   우선순위 2. byMilestoneCount 의 해당 개수 키가 있으면 그 텍스트
    //   우선순위 3. default
    let text = stageBanners.default || '';
    if (stageBanners.byEventCompleted && typeof stageBanners.byEventCompleted === 'object') {
      // completedEvents 는 Set. 배너 정의 순서대로 훑으며 가장 "마지막" 매칭을 택함 (후속 이벤트가 우선).
      for (const [eventId, bannerText] of Object.entries(stageBanners.byEventCompleted)) {
        if (engineState.completedEvents && engineState.completedEvents.has(eventId)) {
          text = bannerText;
        }
      }
    }
    if (stageBanners.byMilestoneCount && stageBanners.byMilestoneCount[achieved]) {
      text = stageBanners.byMilestoneCount[achieved];
    }

    return { text: text, achieved: achieved, threshold: threshold, questId: questId };
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

    // UI 큐 상태 (디버깅용)
    get _uiQueueState() {
      return {
        current: _uiQueue.current,
        pending: _uiQueue.items.slice(),
      };
    },

    // 함수들
    loadScenario:              loadScenario,
    checkStageTransition:      checkStageTransition,
    manageActiveEvents:        manageActiveEvents,
    handleNpcApproach:         handleNpcApproach,
    runNightSimulation:        runNightSimulation,
    getDialogueContext:        getDialogueContext,
    evaluateQuestMilestones:   evaluateQuestMilestones,  // [9단계]
    getCurrentBannerText:      getCurrentBannerText,     // [9단계]
  };


  // ─────────────────────────────────────────────────────
  // 6. 자동 초기화
  // ─────────────────────────────────────────────────────
  // 페이지 로드 시점에 bookstore 시나리오를 자동 장착.
  // 향후 다른 시나리오를 쓰고 싶으면 여기를 바꾸거나 외부에서 loadScenario 재호출.
  loadScenario(window.BOOKSTORE_SCENARIO);

  console.log('[engine] initialized');

})();
