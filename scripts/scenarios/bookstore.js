// =========================================================
// 시나리오 데이터: 서점 도둑질 오해 사건
// =========================================================
//
// 이 파일은 "데이터"만 담는다. 실행 로직(엔진)은 scenarioEngine.js(2단계)에서 별도.
// 전역에 window.BOOKSTORE_SCENARIO 로 노출 → 다른 스크립트가 가져다 쓸 수 있음.
//
// ⚠️ 주의: 아직 엔진이 없으므로 이 파일 자체는 게임 동작에 영향을 주지 않는다.
//          index.html에 <script> 태그를 추가해 "로드만" 되는지 확인하면 1단계 완료.
//
// TODO (8단계 교체 시 반영 필요):
//   - state.js 의 ASSET_SLOTS.evidence 에서 'bamtol_ledger', 'book_reservation_slip' 삭제
//   - state.js 의 ASSET_SLOTS.evidence 에 'yami_backpack' 추가
//   - state.js 의 ASSET_META 에 yami_backpack 항목 추가, 삭제된 2개 제거
//   - state.js __zetaSend 내 /장부|예약/ 키워드로 bamtol_ledger 팝업하는 블록 제거
// =========================================================

window.BOOKSTORE_SCENARIO = {

  // ─────────────────────────────────────────────────────
  // 1. 기본 정보
  // ─────────────────────────────────────────────────────
  id: 'bookstore_misunderstanding',
  name: '서점 도둑질 오해 사건',
  mainNpcIds: ['yami', 'bamtol', 'chaka'],


  // ─────────────────────────────────────────────────────
  // 2. 진실 (AI 참조용, 유저 비공개)
  // ─────────────────────────────────────────────────────
  truth: {
    summary:
      '야미는 밤톨 서점에 예약한 책을 픽업했다. 카운터를 비운 밤톨 대신 ' +
      '장부에 사인하고 가져갔다. 그 과정에서 옆의 책이 떨어져 책장 아래로 ' +
      '들어갔다. 차카는 서점 근처에서 야경 사진 촬영 중 우연히 이 장면을 포착했다.',
    facts: [
      '야미는 책을 훔치지 않았다. 본인이 예약한 책을 집다가 옆 책이 떨어져 책장 아래로 들어갔다.',
      '밤톨은 카운터를 비운 상태였고, 야미는 장부에 사인하고 가져갔다.',
      '차카는 서점 근처에서 야경을 찍고 있었을 뿐, 야미의 행동 맥락을 모른다. 찍은 사진은 자신의 사진관 쇼윈도에 전시했다.',
    ],
  },


  // ─────────────────────────────────────────────────────
  // 3. 스테이지 정의
  // ─────────────────────────────────────────────────────
  stages: ['dormant', 'triggered', 'quest_active', 'resolved'],
  initialStage: 'dormant',


  // ─────────────────────────────────────────────────────
  // 4. 단계 전환 조건
  // ─────────────────────────────────────────────────────
  // 엔진(2단계)이 이 조건을 읽고 전환 여부를 판단한다.
  // 현재 지원 조건 타입:
  //   - sleptAtLeast: 잠든 횟수 N회 이상
  //   - requiredDayEventDone: 특정 낮 이벤트 완료됨
  //   - questResolved: 특정 퀘스트 해결됨
  // 여러 조건은 AND로 결합.
  transitions: {
    dormant: {
      to: 'triggered',
      conditions: [
        { type: 'sleptAtLeast', count: 1 },
      ],
    },
    triggered: {
      to: 'quest_active',
      conditions: [
        { type: 'requiredDayEventDone', eventId: 'chaka_bamtol_distortion' },
        { type: 'sleptAtLeast', count: 2 }, // dormant→triggered 진입 후 1회 더 = 총 2회
      ],
    },
    quest_active: {
      to: 'resolved',
      conditions: [
        { type: 'questResolved', questId: 'yami_dream_crisis' },
      ],
    },
    // resolved 는 최종 상태, 전환 없음
  },


  // ─────────────────────────────────────────────────────
  // 5. 낮 이벤트
  // ─────────────────────────────────────────────────────
  // 각 이벤트는 특정 NPC에 유저가 접근할 때 발동된다 (`trigger.type: 'approachNpc'`).
  // 일부는 단계 진입 즉시 자동 실행된다 (`trigger.type: 'autoOnStageEnter'`).
  //
  // required: true 인 이벤트는 해당 단계에서 "필수"로 지정된 이벤트.
  //           완료돼야 다음 단계 전환 조건이 만족될 수 있다 (단계당 최대 1개).
  //
  // effects: 이벤트 실행 시 일어날 일들. 엔진이 순서대로 처리.
  //   - showEvidencePopup: 증거 이미지 팝업
  //   - injectNpcContext: 특정 NPC의 대화 배경에 임시 문장 추가
  //   - seed: 씨앗 하나 실행 (왜곡 대화 생성용)
  //   - addRumor: 소문 추가
  //   - changeAffinity: 호감도 변동
  //   - showStoryModal: 스토리 모달 표시
  //   - triggerQuest: 퀘스트 발동
  //   - ending: 엔딩 분기 처리
  //
  // preconditions: 이 이벤트가 활성화되려면 먼저 완료돼야 할 이벤트 ID들 (AND)
  dayEvents: {

    // ── dormant 단계 낮 이벤트: 없음 (평온한 대화만)
    dormant: [],

    // ── triggered 단계 낮 이벤트
    triggered: [
      {
        // [카테고리 1 질문5 수정] Day 2 아침 진입 시 자동으로 리포트를 모달로 팝업.
        // 리포트 탭에는 기본 표시 (별도), 여기선 "어젯밤에 뭔가 있었구나" 암시용.
        id: 'd2_morning_reports_popup',
        trigger: { type: 'autoOnStageEnter' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'showReportsModal',
            title: '🌅 2일차 아침 — 어젯밤의 소식',
            bodyIntro: '어젯밤 동네에서 이런 일들이 있었대요:' },
        ],
      },

      {
        // [카테고리 1 질문5 수정]
        // 원래: 차카 접근 → 사진관 쇼윈도 사진만 보여줌
        // 변경: 차카 접근 시 밤톨이 이미 차카 옆에 와 있는 상태 (moveNpc 로 강제 배치).
        //       두 NPC 가 "어제 찍은 사진"을 놓고 대화하던 장면을 플레이어가 목격.
        //       사진(chaka_photo_evidence) 팝업이 뜨고, 둘에게 컨텍스트가 주입된다.
        //       이 이벤트가 완료되면 퀘스트 배너가 처음으로 나타난다 (byEventCompleted).
        id: 'chaka_shows_night_photo',
        trigger: { type: 'approachNpc', npcId: 'chaka' },
        required: true, // triggered 단계의 유일한 필수 이벤트로 승격
        preconditions: [],
        effects: [
          // 밤톨을 차카 바로 옆으로 순간이동시켜 "같이 있던 것처럼" 보이게
          { type: 'moveNpc', npcId: 'bamtol', to: { x: -7.5, z: -3.5 } },
          // 사진 팝업 (사진관 쇼윈도가 아니라 차카가 밤톨에게 보여주는 원본 사진)
          { type: 'showEvidencePopup', assetKey: 'chaka_photo_evidence',
            caption: '차카가 밤톨에게 보여주고 있던 그날 밤의 사진' },
          // 장면 묘사 나레이션 (모달 형태로 간단히)
          { type: 'showStoryModal',
            title: '사진관 앞 — 뜻밖의 장면',
            body:
              '사진관 앞에서 밤톨과 차카가 심각한 얼굴로 이야기를 나누고 있어요.\n\n' +
              '"이 사진… 야미잖아? 서점에 있었던 것 맞지?" — 밤톨\n' +
              '"어… 어젯밤 야경 찍다가 우연히 같이 찍힌 거야. 별 뜻은 없었는데…" — 차카\n\n' +
              '밤톨의 얼굴이 점점 굳어가네요.' },
          // 두 NPC 모두에게 현재 상황 컨텍스트 주입
          { type: 'injectNpcContext', npcId: 'chaka',
            text: '너는 어젯밤 서점 근처에서 야경 사진을 찍다가 우연히 야미가 서점에 있는 모습이 같이 찍혔다. ' +
                  '오늘 낮에 사진관 앞에서 밤톨에게 사진을 보여주고 있는데, 밤톨이 심각하게 반응해서 당황스럽다. ' +
                  '찍은 사진은 보통 사진관 쇼윈도에 전시한다.' },
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '너는 오늘 서점 책 한 권이 없어진 걸 발견했다. 차카가 방금 보여준 사진에서 야미가 서점 안에 있는 모습을 보고, ' +
                  '야미가 훔쳤다고 확신하려 하고 있다. 장부는 아직 확인하지 않았다. 감정이 앞선 상태.' },
        ],
      },

      {
        // [카테고리 1 질문5 수정] 독립 이벤트에서 후속 이벤트로 격하.
        // 밤톨에게 따로 접근해도 "이미 차카한테 들은" 상태이므로 빈 선반만 보여주고
        // 추가 단서 제공. 필수성은 제거 (chaka_shows_night_photo 가 이미 필수).
        id: 'bamtol_finds_missing_book',
        trigger: { type: 'approachNpc', npcId: 'bamtol' },
        required: false,
        preconditions: [
          // chaka_shows_night_photo 가 먼저 완료돼야 함 — 순서 강제
          { all: ['chaka_shows_night_photo'] },
        ],
        effects: [
          { type: 'showEvidencePopup', assetKey: 'missing_book_shelf', caption: '서점 책장의 빈 자리' },
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '너는 방금 책 한 권이 없어진 것을 발견하고 당혹스러운 상태다. 장부를 확인할 생각은 아직 못 하고 있다.' },
        ],
      },

      {
        // chaka_bamtol_distortion: 원래는 triggered 의 클라이맥스였지만, 이제
        // chaka_shows_night_photo 가 그 역할을 가져감. 이 이벤트는 씨앗+소문 생성만.
        // 플레이어가 둘 중 누구에게든 다시 접근하면 발동.
        id: 'chaka_bamtol_distortion',
        trigger: { type: 'approachAnyNpc', npcIds: ['chaka', 'bamtol'] },
        required: false,
        preconditions: [
          { all: ['chaka_shows_night_photo'] },
        ],
        effects: [
          { type: 'seed', seedId: 'distortion_seed' },
          { type: 'addRumor',
            textTemplate: '야미가 밤에 밤톨 서점에서 책을 훔쳤다는 소문이 있지',
            aboutNpcId: 'yami' },
          { type: 'changeAffinity', npcId: 'bamtol', delta: -5 },
          { type: 'changeAffinity', npcId: 'yami', delta: -3 },
        ],
      },

      {
        id: 'bamtol_confronts_yami',
        trigger: { type: 'approachNpc', npcId: 'yami' },
        required: false,
        preconditions: [{ all: ['chaka_bamtol_distortion'] }],
        effects: [
          { type: 'injectNpcContext', npcId: 'yami',
            text: '방금 밤톨이 너에게 찾아와 "왜 책을 훔쳤냐"며 화를 내고 갔다. 너는 큰 충격을 받았고 억울하다.' },
        ],
      },
    ],

    // ── quest_active 단계 낮 이벤트
    quest_active: [
      {
        id: 'yami_retries_bookclub',
        trigger: { type: 'autoOnStageEnter' }, // 단계 진입 즉시 자동 발동
        required: false,
        preconditions: [],
        effects: [
          { type: 'showEvidencePopup', assetKey: 'bookclub_poster', caption: '야미가 준비하던 독서 모임 포스터' },
          { type: 'showStoryModal',
            title: '📖 야미의 꿈이 흔들리고 있어요',
            body: '야미가 준비하던 첫 독서 모임이 위기에 빠졌어요.\n밤톨 서점에서 장소 대여를 거절당했대요.' },
        ],
      },

      {
        id: 'yami_seeks_user',
        trigger: { type: 'approachNpc', npcId: 'yami' },
        required: true, // ⭐ 이 단계의 필수 이벤트
        preconditions: [{ all: ['yami_retries_bookclub'] }],
        effects: [
          { type: 'triggerQuest', questId: 'yami_dream_crisis' },
        ],
      },
    ],

    // ── resolved 단계 낮 이벤트 (엔딩)
    resolved: [
      {
        id: 'ending_scene',
        trigger: { type: 'autoOnStageEnter' },
        required: false,
        preconditions: [],
        effects: [
          // 엔딩 분기는 엔진이 `ending` 효과를 받으면 퀘스트 해결 시 저장된 플래그로 분기 처리
          { type: 'ending', branchKey: 'bookstore_ending' },
        ],
      },
    ],
  },


  // ─────────────────────────────────────────────────────
  // 6. 밤 시뮬레이션 (씨앗)
  // ─────────────────────────────────────────────────────
  // 씨앗 = 밤에 나올 장면 후보. AI가 이걸 읽고 한 줄 요약을 생성한다.
  // 왜곡이 일어나는 씨앗은 `truth`와 `distortion`을 따로 준다.
  // effects: 씨앗이 재생된 뒤 일어날 일들 (밤 시뮬레이션 종료 후 처리)
  nightSeeds: {

    dormant: [
      {
        id: 'yami_night_pickup',
        primaryNpcId: 'yami',
        scene:
          '야미가 서점에서 예약한 책을 집다가 옆에 있던 책이 떨어졌다.',
        // [8단계] publicSummary: 플레이어 리포트에 표시되는 "목격자 시점의 공개 사실".
        // scene (내부용 진실) 과 분리. AI 호출 생략 + 스포일러 방지.
        publicSummary: '야미가 서점에서 예약한 책을 픽업했다.',
        effects: [],
      },
      {
        id: 'chaka_night_photo',
        primaryNpcId: 'chaka',
        scene:
          '차카가 야경을 찍고 있는데, 우연히 서점 안의 야미가 책을 가방에 집어넣는 모습도 찍혔다.',
        publicSummary: '차카가 밤에 돌아다니며 마을의 야경을 찍었다.',
        effects: [],
      },
    ],

    triggered: [
      {
        id: 'yami_confronts_bamtol',
        primaryNpcId: 'yami',
        scene:
          '야미가 자기 가방을 들고 밤톨을 찾아가 오해를 해명하려 한다. ' +
          '가방 안에는 예약한 책 한 권만 있다. 밤톨은 대화를 거부한다.',
        publicSummary: '야미는 오해를 풀기 위해 밤톨의 서점을 찾아갔지만 밤톨은 만남을 거절했다.',
        effects: [
          { type: 'showEvidencePopup', assetKey: 'yami_backpack', caption: '야미의 가방 — 책은 한 권뿐' },
          { type: 'changeAffinity', npcId: 'bamtol', delta: -2 },
        ],
      },
    ],

    quest_active: [
      {
        id: 'bamtol_alone',
        primaryNpcId: 'bamtol',
        scene: '밤톨이 집에서 혼자 장부를 뒤적이며 고민한다.',
        publicSummary: '밤톨의 서점에 밤 늦게까지 불이 켜져 있다. 뭔가 고민하는 듯한 밤톨의 모습이 보였다.',
        effects: [],
      },
      {
        id: 'yami_alone',
        primaryNpcId: 'yami',
        scene: '야미가 집에서 독서모임 포스터를 붙잡고 고민한다.',
        publicSummary: '야미의 울음 소리가 집 밖으로 울려퍼졌다.',
        effects: [],
      },
      {
        id: 'chaka_alone',
        primaryNpcId: 'chaka',
        scene: '차카가 사진관에서 자기 사진을 보며 후회한다.',
        publicSummary: '차카는 사진관에서 머리를 부여잡고 괴로워하고 있었다. 본인의 사진이 문제가 된 것 같아 자책하는 모습이었다.',
        effects: [],
      },
    ],

    // resolved 단계는 밤 시뮬레이션 없음 (엔딩 처리로 대체)
    resolved: [],
  },


  // ─────────────────────────────────────────────────────
  // 7. 낮 이벤트용 씨앗 (왜곡 대화 생성)
  // ─────────────────────────────────────────────────────
  // 낮 이벤트의 `seed` 효과가 가리키는 씨앗들. 밤 씨앗과 구조는 같지만 쓰이는 타이밍이 다름.
  eventSeeds: {
    distortion_seed: {
      scene:
        '차카와 밤톨이 사진관 앞에서 마주쳐 어젯밤 일을 이야기한다. ' +
        '대화 도중 책 한 권 이야기가 "엄청 많은 책"으로 부풀어오른다.',
      truth:      '가방 안에는 책이 한 권만 있었다.',
      distortion: '가방 안에는 책이 엄청 많이 있었다.',
    },
  },


  // ─────────────────────────────────────────────────────
  // 8. 퀘스트
  // ─────────────────────────────────────────────────────
  quests: {
    yami_dream_crisis: {
      id: 'yami_dream_crisis',
      targetNpcId: 'yami',
      // 호감도에 따른 분기. 엔진이 퀘스트 발동 시점에 야미의 affinity를 읽어 선택.
      branches: [
        {
          key: 'high',
          condition: { type: 'affinityGte', npcId: 'yami', value: 50 },
          situation:
            '야미가 당신에게 조용히 찾아와 털어놓아요.\n' +
            '"책을 훔쳤다는 소문 때문에 첫 독서 모임 장소를 빌리려 했던 밤톨 서점에서도 거절당했지... ' +
            '내가 장부에 사인한 걸 확인하면 될 텐데, 밤톨이 들어주질 않아서... 어떻게 해야 할까?"',
        },
        {
          key: 'low',
          condition: { type: 'default' }, // 위 조건에 안 걸리면 자동 선택
          situation:
            '야미가 당신을 복잡한 눈빛으로 쳐다봐요.\n' +
            '"다들 나를 도둑이라고 보지... 당신도 그렇게 보는 거지? ' +
            '독서 모임은 이제 못 열 것 같아..."',
        },
      ],
      // 해결 시 효과
      onResolved: [
        { type: 'setFlag', key: 'bookstore_ending_route' }, // 어느 분기였는지 저장
      ],

      // ────────────────────────────────────────────────
      // [9단계 추가] 마일스톤 = 퀘스트 "해결 조건"
      // ────────────────────────────────────────────────
      // 대화창을 닫을 때마다 엔진이 대화 로그를 AI로 판정해서
      // 어떤 마일스톤이 달성됐는지 확인한다.
      // 달성된 마일스톤 수가 resolveThreshold 이상이면 퀘스트 해결.
      //
      // triggerCondition 은 AI 프롬프트에 그대로 들어가므로 명확한 한국어로.
      // applicableNpcs 는 "이 NPC 와의 대화에서만 이 마일스톤 달성 가능" 제한.
      // (예: 야미와 대화하면서 "밤톨에게 장부 얘기 꺼냄" 달성되는 오판 방지)
      milestones: [
        {
          id: 'understood_yamis_side',
          description: '야미의 입장을 들어봄',
          triggerCondition:
            '야미와의 대화에서 야미가 훔치지 않았다는 해명, 억울함, ' +
            '장부 사인 이야기 중 하나 이상을 듣거나 유저가 야미에게 공감을 표함',
          applicableNpcs: ['yami'],
        },
        {
          id: 'raised_ledger_question',
          description: '장부/사인 문제를 밤톨에게 제기',
          triggerCondition:
            '밤톨과의 대화에서 유저가 "장부", "사인", "예약", "확인해봤냐" 등의 표현으로 ' +
            '밤톨이 장부를 확인하지 않았다는 점을 지적',
          applicableNpcs: ['bamtol'],
        },
        {
          id: 'questioned_photo_evidence',
          description: '사진 증거의 한계를 지적함',
          triggerCondition:
            '밤톨 또는 차카와의 대화에서 유저가 "사진만으로는 알 수 없다", ' +
            '"맥락이 없다", "결정적이지 않다" 같은 취지로 사진 증거의 불완전성을 지적',
          applicableNpcs: ['bamtol', 'chaka'],
        },
      ],

      // 3개 중 2개 달성되면 해결. 유저에게 "모든 정답"을 요구하지 않음 —
      // 다양한 플레이 경로 허용.
      resolveThreshold: 2,
    },
  },


  // ─────────────────────────────────────────────────────
  // 8.5 퀘스트 배너 [9단계 추가]
  // ─────────────────────────────────────────────────────
  // 화면 상단에 표시될 퀘스트 진행 안내 텍스트.
  // 엔진이 현재 스테이지 + 달성된 마일스톤 수 + NPC 호감도를 보고
  // 적절한 텍스트를 선택한다. (getCurrentBannerText)
  //
  // 구조:
  //   스테이지명: {
  //     default: '기본 배너 텍스트',
  //     byMilestoneCount: { 1: '...', 2: '...' },  // 해당 개수 달성 시 덮어씀
  //   }
  //
  // text: '' 또는 섹션 생략 시 배너 숨김.
  questBanners: {
    dormant: {
      default: '',  // 평온한 일상 — 배너 없음
    },
    triggered: {
      // [카테고리 1 질문5 수정]
      // Day 2 아침에는 배너가 바로 뜨지 않는다.
      // 플레이어가 차카에게 접근해서 'chaka_shows_night_photo' 이벤트를 목격한 뒤에만 배너 등장.
      default: '',  // 기본은 빈 배너 (아침 진입 직후)
      byEventCompleted: {
        'chaka_shows_night_photo': '동네에 무슨 일이 생긴 것 같아요. 직접 확인해보세요.',
      },
    },
    quest_active: {
      default: '📖 야미의 독서 모임이 위기에 빠졌어요. 밤톨의 오해를 풀어주세요',
      byMilestoneCount: {
        1: '📖 조금씩 실마리가 보여요. 대화를 계속해보세요',
        2: '📖 오해가 거의 풀렸어요. 마지막 한 걸음이에요',
      },
    },
    resolved: {
      default: '✨ 사건이 마무리되었어요',
    },
  },


  // ─────────────────────────────────────────────────────
  // 9. 증거 이미지 카탈로그 (6장)
  // ─────────────────────────────────────────────────────
  // 각 증거의 메타정보. 엔진이 팝업 표시용으로 참조.
  // ⚠️ yami_backpack 은 현재 state.js의 ASSET_META 에 아직 등록 안 됨 — 8단계에서 추가 필요
  evidence: {
    photostudio_window:   { label: '사진관 쇼윈도', emoji: '🖼️' },
    missing_book_shelf:   { label: '빈 선반',       emoji: '📚' },
    chaka_photo_evidence: { label: '차카 야경사진', emoji: '📷' },
    yami_backpack:        { label: '야미의 가방',   emoji: '🎒' }, // ⭐ 신규 (8단계 때 등록)
    bookclub_poster:      { label: '독서모임 포스터', emoji: '📝' },
    missing_book_found:   { label: '선반 밑 책',    emoji: '📖' },
  },


  // ─────────────────────────────────────────────────────
  // 10. NPC 대화 배경 (단계별)
  // ─────────────────────────────────────────────────────
  // 엔진이 대화 시 현재 단계에 맞는 배경을 AI 프롬프트에 주입.
  // base: 항상 들어가는 기본 배경
  // stages: 해당 단계에 있을 때 추가로 들어가는 배경
  //
  // 낮 이벤트의 injectNpcContext 효과로 "임시" 배경이 추가로 붙을 수도 있음 (엔진이 처리).
  npcDialogueContext: {
    chaka: {
      base: '너는 사진사 차카다. 어젯밤 서점 근처에서 야경 사진을 찍었다. 찍은 사진은 보통 사진관 쇼윈도에 전시한다.',
      stages: {
        dormant:      '지금은 아직 어젯밤 사건이 터지기 전. 유저가 "어제 뭐 했어"라고 물으면 "오늘 밤에 동네 야경 좀 찍어볼까 해. 서점 쪽 풍경이 괜찮더라고" 같은 대답 가능. 사진 찍는 일에 애정이 많고 동네 풍경을 좋아한다는 분위기로 대화.',
        triggered:    '너는 야경 사진을 인화했다. 사진에 우연히 야미가 서점 안에 있는 모습이 찍혔다. 오늘 낮에 사진관 앞에서 밤톨에게 사진을 보여줬다가 밤톨이 심각하게 반응해서 당황했다. 너는 야미가 뭘 했는지는 잘 모른다.',
        quest_active: '나중에 사진을 본 밤톨이 "야미가 책을 훔쳤다"고 오해했다는 걸 알게 되었다. 너는 단지 야경이 아름다워서 찍었을 뿐이다. 지금은 사진이 이런 오해를 부른 게 미안하고, 사진을 내려야 할지 고민 중이다.',
        resolved:     '오해가 풀렸다. 사진을 계속 걸어둘지 말지는 야미와 상의하려 한다.',
      },
    },
    yami: {
      base: '너는 문학도 학생 야미다. 밤톨 서점에 책을 예약했고, 카운터가 비어있어서 장부에 사인하고 책을 픽업했다. 그 과정에서 옆의 책이 떨어졌는지는 모른다. 훔친 게 아니다.',
      stages: {
        dormant:      '지금은 아직 책을 픽업하기 전. 오늘 밤에 서점에 가서 예약해 둔 책을 받아올 계획이다. 책 고르는 걸 좋아하고 요즘은 곧 열 독서 모임 준비로 설레는 분위기. 유저가 "요즘 어때"라고 물으면 "새로 온 책 픽업하러 오늘 밤에 서점 갈 거야! 독서 모임도 곧 시작할 건데, 장소는 밤톨 서점을 빌릴까 생각 중이야" 같은 식으로 복선이 되는 대답.',
        triggered:    '오늘 도둑이라는 소문을 듣고 큰 충격을 받았다. 가방에는 책 한 권만 있다는 걸 보여주러 밤톨을 찾아갔지만 대화를 거부당했다. 억울하고 슬프다.',
        quest_active: '밤톨이 독서 모임 장소 대여를 거절했다. 꿈이 흔들린다.',
        resolved:     '사건이 마무리됐다. 오해가 풀렸다.',
      },
    },
    bamtol: {
      base: '너는 서점 주인 밤톨이다. 책을 사랑하고 원칙을 중시한다.',
      stages: {
        dormant:      '지금은 아직 사건이 터지기 전. 오늘은 서점에 손님이 좀 뜸했다. 장부 관리를 성실히 하는 편. 유저가 "요즘 어때"라고 물으면 "요즘 손님이 뜸해. 그래도 야미가 예약한 책이 오늘 들어왔으니까 픽업하러 올 거야" 같은 식으로 대답 가능. 서점에 대한 자부심이 묻어나는 분위기.',
        triggered:    '너는 책이 한 권 사라진 것을 발견했다. 차카의 사진을 본 후 야미가 훔쳤다고 믿고 있다. 사실 장부에 야미의 사인이 있지만 감정이 앞서 확인 못 하고 있다.',
        quest_active: '야미가 독서 모임 장소를 빌려달라고 했지만 거절했다.',
        resolved:     '책이 책장 아래서 발견됐다. 야미에게 사과했다.',
      },
    },
  },


  // ─────────────────────────────────────────────────────
  // 11. 엔딩 분기 정의
  // ─────────────────────────────────────────────────────
  // resolved 단계 ending_scene 이벤트에서 사용.
  // 엔진이 저장된 플래그(예: 호감도 상태)를 읽어 분기 선택.
  endings: {
    bookstore_ending: {
      branches: [
        {
          key: 'high',
          condition: { type: 'affinityGte', npcId: 'yami', value: 50 },
          effects: [
            { type: 'showEvidencePopup', assetKey: 'missing_book_found', caption: '책장 아래에서 발견된 책' },
            { type: 'changeAffinity', npcId: 'yami',   delta: +10 },
            { type: 'changeAffinity', npcId: 'bamtol', delta: +5 },
            { type: 'showStoryModal',
              title: '🌅 화해의 아침',
              body: '당신과 밤톨이 함께 서점을 뒤져 책을 찾아냈어요.\n오해가 풀리고, 야미는 다시 독서 모임을 준비할 수 있게 됐어요.' },
          ],
        },
        {
          key: 'low',
          condition: { type: 'default' },
          effects: [
            { type: 'showEvidencePopup', assetKey: 'missing_book_found', caption: '책장 아래에서 발견된 책' },
            { type: 'changeAffinity', npcId: 'yami',   delta: +5 },
            { type: 'changeAffinity', npcId: 'bamtol', delta: +3 },
            { type: 'showStoryModal',
              title: '🌅 늦은 사과',
              body: '밤톨과 야미가 서점에서 함께 책을 발견했어요.\n밤톨이 당신을 찾아와 사과했지만, 무언가 어색한 분위기가 남아있어요.' },
          ],
        },
      ],
    },
  },

}; // end of window.BOOKSTORE_SCENARIO

console.log('[scenario] BOOKSTORE_SCENARIO loaded');
