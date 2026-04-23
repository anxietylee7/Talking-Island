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
//   [이후 예정]
//     6단계: handleNpcApproach(작업 3) + triggerQuest/seed effect 추가 + gameplay.js 연결
//     7단계: getDialogueContext(작업 5) + state.js 연결
//     8단계: gameplay.js의 advanceToNightAndMorning 완전 교체 + 기존 하드코딩 제거
//
// ⚠️ 현재 상태: 기존 코드(state.js / gameplay.js / scene.js)는 아직
//    엔진을 호출하지 않는다. 즉, 이 파일은 게임 흐름에 자동으로는 끼어들지 않는다.
//    runNightSimulation, checkStageTransition 등은 콘솔에서 수동 호출해 검증.
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
    console.log('[engine] stage transitioned to:', newStage);

    // 새 단계 낮 이벤트 활성화
    manageActiveEvents();

    // autoOnStageEnter 이벤트 즉시 실행
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
  function _applyEffects(effects, context) {
    const log = [];
    if (!Array.isArray(effects)) return log;

    for (const fx of effects) {
      try {
        switch (fx.type) {

          case 'showEvidencePopup':
            // state.js 의 전역 함수 showEvidencePopup(assetKey, context) 호출.
            if (typeof showEvidencePopup === 'function') {
              showEvidencePopup(fx.assetKey, fx.caption || '');
              log.push({ type: fx.type, assetKey: fx.assetKey, status: 'ok' });
            } else {
              console.warn('[engine][effect] showEvidencePopup 함수 없음 (state.js 미로드?)');
              log.push({ type: fx.type, status: 'skipped_no_func' });
            }
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
            // state.js 의 전역 showStoryModal(title, body) 호출.
            if (typeof showStoryModal === 'function') {
              showStoryModal(fx.title || '', fx.body || '');
              log.push({ type: fx.type, title: fx.title, status: 'ok' });
            } else {
              console.warn('[engine][effect] showStoryModal 함수 없음');
              log.push({ type: fx.type, status: 'skipped_no_func' });
            }
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

          default:
            // 이 단계에서 미지원 타입은 6~8단계에서 추가됨.
            console.log(
              '[engine][effect] 미지원 effect 타입 (현 단계에선 스킵): ' + fx.type +
              ' (from ' + (context && context.source) + ')'
            );
            log.push({ type: fx.type, status: 'unsupported_in_stage' });
            break;
        }
      } catch (err) {
        console.error('[engine][effect] 실행 중 에러 (계속 진행):', fx, err);
        log.push({ type: fx.type, status: 'error', error: String(err) });
      }
    }
    return log;
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
