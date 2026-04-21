// =========================================================
// 데이터 & 상수
// =========================================================
const ANIMALS = [
  { species: '앵무새', emoji: '🦜', color: 0xffd580, trait: '수다쟁이', speechTraits: '말이 빠르고 들은 얘기를 꼭 옮긴다' },
  { species: '부엉이', emoji: '🦉', color: 0xc9b892, trait: '관찰자', speechTraits: '차분하고 정확하다' },
  { species: '거북이', emoji: '🐢', color: 0xa8dcc3, trait: '느긋함', speechTraits: '천천히 반응한다' },
  { species: '고양이', emoji: '🐱', color: 0xf4c7a1, trait: '변덕', speechTraits: '도도하거나 애교 많다' },
  { species: '토끼', emoji: '🐰', color: 0xfad4d8, trait: '활발', speechTraits: '들떠있고 감탄사 많다' },
  { species: '너구리', emoji: '🦝', color: 0xa8a8a8, trait: '신중', speechTraits: '한 템포 쉬고 말한다' },
  { species: '다람쥐', emoji: '🐿️', color: 0xd4a574, trait: '성실', speechTraits: '또박또박 말하고 감정이 얼굴에 드러난다' },
];

// 시나리오 고정 NPC 5명 (전체 시작 멤버)
const STORY_NPCS = [
  {
    id: 'story_chaka',
    name: '차카', species: '너구리', emoji: '🦝', color: 0xa8a8a8,
    trait: '신중', job: '동네 사진사', dream: '동네 사진집 출간',
    personality: '조용하고 관찰력이 좋으며, 말수가 적다',
    speechHabit: '~인 것 같아요', secretSkill: '풍경 사진',
    level: 2, affinity: 40, dreamProgress: 45,
    isStory: true, isMain: true,
  },
  {
    id: 'story_yami',
    name: '야미', species: '고양이', emoji: '🐱', color: 0xf4c7a1,
    trait: '변덕', job: '문학도 학생', dream: '독서 모임 만들기',
    personality: '조용하지만 좋아하는 책 얘기만 나오면 눈이 반짝거리는 책벌레',
    speechHabit: '~다냥', secretSkill: '시 낭송',
    level: 3, affinity: 45, dreamProgress: 60,
    isStory: true, isMain: true,
  },
  {
    id: 'story_bamtol',
    name: '밤톨', species: '다람쥐', emoji: '🐿️', color: 0xd4a574,
    trait: '성실', job: '서점 주인', dream: '',
    personality: '책을 사랑하고 원칙을 중시하며, 자기 서점에 대한 자부심이 크다',
    speechHabit: '~쿵', secretSkill: '고서 감정',
    level: 2, affinity: 35, dreamProgress: 0,
    isStory: true, isMain: true,
  },
  {
    id: 'story_luru',
    name: '루루', species: '토끼', emoji: '🐰', color: 0xfad4d8,
    trait: '활발', job: '바리스타', dream: '시그니처 블렌드 만들기',
    personality: '밝고 에너지 넘치며, 모든 손님을 기억한다',
    speechHabit: '~뿅', secretSkill: '라떼아트',
    level: 1, affinity: 35, dreamProgress: 20,
    isStory: true,
  },
  {
    id: 'story_somi',
    name: '솜이', species: '앵무새', emoji: '🦜', color: 0xffd580,
    trait: '수다쟁이', job: '플로리스트', dream: '계절 꽃 축제 열기',
    personality: '수다스럽고 감정이 풍부하며, 동네 소식을 가장 먼저 전한다',
    speechHabit: '~뿌', secretSkill: '꽃말 사전',
    level: 1, affinity: 35, dreamProgress: 15,
    isStory: true,
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
  rumorText: '야미가 밤에 밤톨 서점에서 책을 훔쳤다는 소문이 있다냥',
  rumorTextMild: '야미가 밤톨 서점에서 책을 몰래 가져갔다더라쿵',
  chakaReport: '어젯밤 차카가 사진관 쇼윈도에 야경 사진을 걸어뒀어요.',
  yamiReport: '어젯밤 야미가 뒷길에서 가방을 들고 나왔어요.',
  bamtolReport: '밤톨이 아침부터 사진관 앞에서 얼굴이 굳은 채 서 있었어요.',
};

const LOCATIONS = [
  { name: '광장', x: 0, z: 0, color: 0xfff0cc, emoji: '⛲' },
  { name: '사진관', x: -8, z: -6, color: 0xffd6cc, emoji: '📸', interior: 'photostudio' },
  { name: '카페', x: 7, z: -5, color: 0xd4a5f5, emoji: '☕', interior: 'cafe' },
  { name: '꽃가게', x: -7, z: 7, color: 0xfad4d8, emoji: '🌸', interior: 'flower' },
  { name: '서점', x: 8, z: 6, color: 0xc9dcf5, emoji: '📚', interior: 'bookstore' },
  { name: '연못', x: 0, z: 9, color: 0xa8d0dc, emoji: '🪷' },
  { name: '우리집', x: 0, z: -11, color: 0xfff5e1, emoji: '🏠', interior: 'home', userOnly: true },
];
