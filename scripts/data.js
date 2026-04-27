// =========================================================
// 데이터 & 상수
// =========================================================

// 시나리오 고정 NPC 5명 (전체 시작 멤버)
// id는 assets.js의 이미지 키와 매칭됨 (chaka → chaka_natural, chaka_happy ...)
const STORY_NPCS = [
  {
    id: 'chaka',
    name: '차카', emoji: '📸',
    color: 0xc9b892, // 따뜻한 베이지 (사진사 톤)
    trait: '신중', job: '동네 사진사', dream: '동네 사진집 출간',
    personality: '조용하고 관찰력이 좋으며, 말수가 적다',
    speechHabit: '음...', secretSkill: '풍경 사진',
    level: 2, affinity: 40, dreamProgress: 45,
    isStory: true, isMain: true,
    homeLocation: 'photostudio',
  },
  {
    id: 'yami',
    name: '야미', emoji: '📖',
    color: 0xf4c7a1, // 부드러운 살구색 (학생 톤)
    trait: '변덕', job: '문학도 학생', dream: '독서 모임 만들기',
    personality: '책을 좋아하는 문학 소년. 하지만 성격이 늘 밝고 친절하여 마을 사람 모두가 좋아한다. 어떤 이야기든 호응을 잘 해주는 타입.',
    speechHabit: '우와!', secretSkill: '시 낭송',
    level: 3, affinity: 45, dreamProgress: 60,
    isStory: true, isMain: true,
    homeLocation: 'outside',
  },
  {
    id: 'bamtol',
    name: '밤톨', emoji: '📚',
    color: 0xd4a574, // 짙은 호박색 (서점 주인 톤)
    trait: '성실', job: '서점 주인', dream: '',
    personality: '책을 사랑하고 원칙을 중시하며, 자기 서점에 대한 자부심이 크다. 고집이 세며 자기가 옳다고 믿는 성격. 단호하다.',
    speechHabit: '', secretSkill: '고서 감정',
    level: 2, affinity: 35, dreamProgress: 0,
    isStory: true, isMain: true,
    homeLocation: 'bookstore',
  },
  {
    id: 'luru',
    name: '루루', emoji: '☕',
    color: 0xfad4d8, // 핑크 (바리스타 톤)
    trait: '활발', job: '바리스타', dream: '시그니처 블렌드 만들기',
    personality: '밝고 에너지 넘치며, 모든 손님을 기억한다',
    speechHabit: '~었!', secretSkill: '라떼아트',
    level: 1, affinity: 35, dreamProgress: 20,
    isStory: true,
    homeLocation: 'cafe',
  },
  {
    id: 'somi',
    name: '솜이', emoji: '🌸',
    color: 0xffd580, // 따뜻한 노란색 (플로리스트 톤)
    trait: '수다쟁이', job: '플로리스트', dream: '계절 꽃 축제 열기',
    personality: '수다스럽고 감정이 풍부하며, 동네 소식을 가장 먼저 전한다',
    speechHabit: '~음~', secretSkill: '꽃말 사전',
    level: 1, affinity: 35, dreamProgress: 15,
    isStory: true,
    homeLocation: 'flower',
  },
];

// 시나리오 스토리 데이터
const BOOKSTORE_STORY = {
  summary: '야미가 밤톨 서점에 예약한 책을 밤에 뒷문으로 픽업했는데, 같은 시각 차카가 야경 사진을 찍다가 우연히 그 장면이 찍혔다. 밤톨이 사진을 보고 "야미가 책을 훔친 것"이라 오해한다.',
  day1Hint: '동네 광장에 차카·야미·밤톨 세 주민이 이사왔어요. 편하게 인사해보세요.',
  day2Opening: {
    title: '🌅 이상한 소문이 돌기 시작했어요',
    body: '오늘 아침 동네 게시판에 "야미가 밤톨 서점에서 책을 훔쳤다"는 글이 올라왔어요. 차카가 찍은 야경 사진 한 장이 화근이었대요.\n\n밤톨은 장부도 확인하지 않고 감정이 앞섰고, 야미는 곧 열 첫 독서 모임 장소로 밤톨 서점을 빌리기로 했었는데…'
  },
  rumorText: '야미가 밤에 밤톨 서점에서 책을 훔쳤다는 소문이 있지',
  rumorTextMild: '야미가 밤톨 서점에서 책을 몰래 가져갔다더군',
  chakaReport: '어젯밤 차카가 사진관 쇼윈도에 야경 사진을 걸어뒀어요.',
  yamiReport: '어젯밤 야미가 뒷길에서 가방을 들고 나왔어요.',
  bamtolReport: '밤톨이 아침부터 사진관 앞에서 얼굴이 굳은 채 서 있었어요.',
};

const LOCATIONS = [
  { name: '광장', x: 0, z: 0, color: 0xfff0cc, emoji: '⛲' },
  // [Tier 3 #6] 건물 파스텔 5색 팔레트
  //   서점=크림, 카페=연붉은, 꽃가게=연보라, 사진관=멜론/올리브, 우리집=복숭아
  //   (도서관은 이 동네에 없으므로 도서관 배정색은 유저 집에 적용)
  // [Tier 3 #5] signText — 건물 지붕 위에 떠 있는 3D 간판의 텍스트.
  //   scene.js 의 건물 생성 루프에서 이 필드가 있으면 CanvasTexture 기반 sprite 로
  //   지붕 위에 간판 mesh 를 붙임. 유저 집은 생략 (loc.userOnly).
  { name: '사진관', x: -8, z: -6, color: 0xd8e4b0, emoji: '📸', interior: 'photostudio',
    signText: '사진관',
    door: { x: -8, z: -3.5 } },
  { name: '카페', x: 7, z: -5, color: 0xf9c8d0, emoji: '☕', interior: 'cafe',
    signText: '카페',
    door: { x: 7, z: -2.5 } },
  { name: '꽃가게', x: -7, z: 7, color: 0xd5c9f0, emoji: '🌸', interior: 'flower',
    signText: '꽃가게',
    door: { x: -7, z: 4.5 } },
  { name: '서점', x: 8, z: 6, color: 0xfff4d6, emoji: '📚', interior: 'bookstore',
    signText: '서점',
    door: { x: 8, z: 3.5 } },
  { name: '연못', x: 0, z: 9, color: 0xa8d0dc, emoji: '🪷' },
  { name: '우리집', x: 0, z: -11, color: 0xfcd4b8, emoji: '🏠', interior: 'home', userOnly: true,
    door: { x: 0, z: -8.5 } },
];
