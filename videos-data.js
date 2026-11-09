/* =========================================================
   videos-data.js — 유튜브 추천 강의 (학습 순서대로)
   ---------------------------------------------------------
   2026년 11월에 영상이 실제로 있는지 확인한 목록이에요.
   영상을 추가하려면 { id: '유튜브 영상 주소의 v= 뒤 11글자', title, channel }
   형태로 한 줄 넣으면 돼요. 재생목록은 list: '재생목록 ID' 를 써요.
   ========================================================= */

const VIDEO_SECTIONS = [
  {
    key: 'hiragana', step: '1단계', name: '히라가나',
    desc: '일본어의 기본 글자예요. 글자표에서 소리를 들으며 같이 보세요.',
    videos: [
      { id: 'Dshu6hotZOc', title: '(왕초보 일본어 처음 시작하기) 히라가나 50음도 쉽게 외우기', channel: '다시, 날다' },
      { id: 'RO36ort7uZQ', title: '히라가나 암기 동영상', channel: '시사북스' },
      { id: 'm1Tfemhya6c', title: '히라가나 배우기｜왕초보 기초 일본어 독학 듣기 루틴', channel: '일본어성장소' },
      { id: 'aTFuaiBOY70', title: '히라가나 쉽게 외우기 | 랜덤 읽기 테스트', channel: '히라가나 쉽게 외우기' },
    ],
  },
  {
    key: 'katakana', step: '2단계', name: '가타카나',
    desc: '커피(コーヒー)처럼 외래어를 쓸 때 쓰는 글자예요.',
    videos: [
      { id: 'vNGkH1ayAHE', title: '가타카나 특강 1탄!', channel: '일단기' },
      { id: 'NMSYV56j-fc', title: '일본어 기초 가타카나 20분 만에 외우는 꿀팁 대공개 (일짱 연지센세 2탄)', channel: '해커스' },
      { id: 'A70P4SvI0cg', title: '가타카나 암기 동영상', channel: '시사북스' },
      { id: 'jW-8QFfhgCU', title: '한국에 없는 히라가나 가타카나 완벽 암기법', channel: '랑팡의 니혼라이프' },
    ],
  },
  {
    key: 'sound', step: '3단계', name: '발음 (탁음·요음·촉음·장음)',
    desc: '점(゛)이 붙은 글자, 작은 ゃゅょ, 작은 っ, 길게 읽는 소리를 배워요.',
    videos: [
      { id: 'KRmo3Q2v1MM', title: '도이미호의 기초 일본어 - 발음편 : 반탁음, 촉음, 장음', channel: 'EBSlang' },
      { id: 'Ab8MCvLXK4w', title: '청음과 탁음 발음 듣고 따라하기 [일본어기초1_2강]', channel: '방송대 지식+' },
      { id: 'X1MXPzNm3gw', title: '일본어 탁음 반탁음 요음 장음 발음 촉음 총정리', channel: '주땡' },
      { id: 'YjlpNn3ScJ0', title: '히라가나 촉음, 발음, 장음 배우기! (착! 붙는 일본어 독학 첫걸음 4강)', channel: '시사북스' },
      { id: 'V7xnjimYzck', title: '듣다 보면 배워지는 일본어 - 탁음, 반탁음, 요음, 촉음, 장음, 발음', channel: 'DYBooks' },
    ],
  },
  {
    key: 'words', step: '4단계', name: 'JLPT N5 단어',
    desc: '앱의 단어장으로 외우고, 영상으로 소리를 반복해서 들어 보세요.',
    videos: [
      { id: 'xMhfcy_WVco', title: '[일본인 발음] JLPT N5 필수단어 300개 | 일본어 1시간', channel: '알려줘 랭짱' },
      { list: 'PLo1tEe7DjAxPDgyyMISzc8u15pqUFU5BS', title: '[일본어 초급 어휘] JLPT N5 단어 10일 완전 정복 (재생목록)', channel: '유리센 일본어' },
      { id: 'neA7zXsruZQ', title: 'JLPT N5 500 단어 풀버전 (한국어 음성 포함)', channel: '쉐도잉 일본어' },
      { id: '3tWghN7wxOI', title: "'예문으로 익히는' 일본어 기본단어 JLPT N5 500", channel: '쉐도잉 일본어' },
    ],
  },
  {
    key: 'talk', step: '5단계', name: '기초 회화 듣기',
    desc: '글자와 단어에 익숙해지면, 짧은 문장을 귀로 익혀요.',
    videos: [
      { id: 'mI_ukS2Gl2k', title: '일본어 왕초보 기초 회화 반복 듣기 | 일상 표현 50문장', channel: '일본어성장소' },
      { id: 's8CqnL9dV9M', title: '왕초보 기초 일본어회화 50문장 듣기 | 생활일본어 필수 표현', channel: '일본어성장소' },
    ],
  },
];
