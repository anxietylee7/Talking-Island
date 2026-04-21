function selectNpc(npcId) {
  const npc = state.npcs.find(n => n.id == npcId);
  if (!npc) return;
  
  // 시나리오 NPC는 제타 스타일 팝업 채팅
  if (npc.isStory && ['story_chaka', 'story_yami', 'story_bamtol'].includes(npc.id)) {
    openZeta(npc.id);
    return;
  }
  
  // 일반 NPC는 기존 사이드 패널 채팅
  state.selectedNpcId = npcId;
  state.activeTab = 'chat';
  renderNpcList();
  renderTabs();
  renderContent();
  // 카메라 이동
  const mesh = npcMeshes[npcId]?.mesh;
  if (mesh) {
    if (state.viewMode === 'interior') {
      cameraTarget.lerp(new THREE.Vector3(mesh.position.x, 1, mesh.position.z), 0.3);
    } else {
      cameraTarget.lerp(mesh.position, 0.5);
    }
  }
}

async function rollGacha() {
  if (state.loading) return;
  setLoading(true, '새 주민을 부르는 중...');
  try {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const existing = state.npcs.filter(n => n.species === animal.species);
    
    if (existing.length > 0 && Math.random() < 0.5) {
      const target = existing[Math.floor(Math.random() * existing.length)];
      if (target.level < 3) {
        target.level += 1;
        if (target.level === 2 && target.dreamProgress === 0) target.dreamProgress = 30;
        showNotification(`${animal.emoji} ${target.name}이(가) Lv.${target.level}로 성장했어요!`);
        renderNpcList();
        renderCounts();
        setLoading(false);
        return;
      }
    }
    
    const prompt = `동물 주민 동네 게임의 새 NPC를 JSON으로 생성해줘.

종족: ${animal.species} ${animal.emoji}
종족특성: ${animal.trait}
말투특성: ${animal.speechTraits}

현재 동네 NPC: ${state.npcs.map(n => `${n.name}(${n.species},${n.job})`).join(', ') || '없음'}

다음 JSON 형식으로만 답해:
{
  "name": "이름 (한글 2-3자, 귀엽게)",
  "job": "직업 (구체적으로)",
  "dream": "꿈 (직업에서 한 단계 위의 목표)",
  "personality": "성격 한 줄",
  "speechHabit": "말버릇 (예: ~냥, ~뿅, ~쿵)",
  "secretSkill": "비밀 특기"
}`;
    
    const data = await callClaude(
      '너는 귀엽고 캐주얼한 동물 주민 게임의 캐릭터 디자이너야.',
      prompt, true
    );
    
    const newNpc = {
      id: Date.now(),
      species: animal.species,
      emoji: animal.emoji,
      color: animal.color,
      trait: animal.trait,
      ...data,
      level: 1,
      affinity: 30,
      dreamProgress: 0,
      location: 'outside',
    };
    state.npcs.push(newNpc);
    spawnNpcMesh(newNpc);
    showNotification(`${newNpc.emoji} ${newNpc.name}이(가) 동네에 왔어요!`);
    renderNpcList();
    renderCounts();
  } catch (err) {
    showNotification('오류가 발생했어요.');
  } finally {
    setLoading(false);
  }
}

async function sendChatMessage(text) {
  console.log('[sendChatMessage] start', { text, selectedNpcId: state.selectedNpcId, loading: state.loading });
  if (!text.trim() || !state.selectedNpcId || state.loading) {
    console.warn('[sendChatMessage] aborted', { reason: !text.trim() ? 'no text' : !state.selectedNpcId ? 'no npc' : 'loading' });
    return;
  }
  const npc = state.npcs.find(n => n.id == state.selectedNpcId);
  if (!npc) return;
  const npcId = npc.id;
  
  const history = state.chatHistory[npcId] || [];
  history.push({ role: 'user', text: text.trim() });
  state.chatHistory[npcId] = history;
  renderContent();
  
  setLoading(true, `${npc.name} 생각중...`);
  try {
    let storyContext = '';
    if (npc.isStory) {
      const stage = state.storyStage;
      if (npc.id === 'story_chaka') {
        storyContext = `\n\n[배경 - 너는 사진사 차카다]\n- 너는 어젯밤 사진관 앞에서 야경 사진을 찍었다.\n- 나중에 사진을 본 밤톨이 "야미가 책을 훔쳤다"고 오해했다는 걸 ${stage === 'day1' ? '아직 모른다' : '알게 되었다'}.\n- 너는 단지 야경이 아름다워서 찍었을 뿐이고, 야미가 뭘 하는지는 잘 못 봤다.\n- ${stage === 'quest_active' || stage === 'day2_triggered' ? '지금은 상황이 혼란스러워서 사진을 내려야 할지 고민 중이다.' : ''}`;
      } else if (npc.id === 'story_yami') {
        storyContext = `\n\n[배경 - 너는 문학도 학생 야미다]\n- 너는 밤톨 서점에 책을 예약했고, 뒷문 열쇠를 받아 밤에 책을 픽업했다. 훔친 게 아니다.\n- 독서 모임을 준비 중이고, 첫 모임 장소로 밤톨 서점을 빌리기로 했었다.\n- ${stage === 'day2_triggered' ? '오늘 도둑이라는 소문을 듣고 큰 충격을 받았다. 억울하고 슬프다.' : ''}\n- ${stage === 'quest_active' ? '밤톨이 독서 모임 장소 대여를 거절했다. 꿈이 흔들린다.' : ''}\n- ${stage === 'resolved' ? '사건이 마무리됐다.' : ''}`;
      } else if (npc.id === 'story_bamtol') {
        storyContext = `\n\n[배경 - 너는 서점 주인 밤톨이다]\n- 너는 야미가 책을 "훔쳤다"고 믿고 있다. 차카의 야경 사진 한 장이 근거다.\n- 사실은 야미가 예약한 책이고, 너의 장부에 기록이 있다. 하지만 감정이 앞서서 확인을 못 하고 있다.\n- ${stage === 'day2_triggered' ? '지금 화가 나 있고, 누구든 이 얘기를 꺼내면 방어적이다.' : ''}\n- ${stage === 'quest_active' ? '야미가 독서 모임 장소를 빌려달라고 했지만 거절했다.' : ''}`;
      }
    }
    
    const system = `너는 동물 주민 동네 게임의 NPC다. 귀엽고 캐주얼한 톤으로 짧게 대답해.

너의 정보:
- 이름: ${npc.name} (${npc.species} ${npc.emoji})
- 직업: ${npc.job}
- 꿈: ${npc.dream} (${npc.dreamProgress}%)
- 성격: ${npc.personality}
- 말버릇: "${npc.speechHabit}" (자주 섞어)
- 종족특성: ${npc.trait}
- 호감도: ${npc.affinity}/100

규칙:
- 1-2문장만
- 말버릇을 자주 붙여
- 호감도 낮으면 거리감 있게, 높으면 친근하게
- 최근 동네 소문을 꺼낼 수도 있음${storyContext}

최근 동네 소문: ${state.rumors.slice(-3).map(r => r.text).join(' / ') || '없음'}`;
    
    // history를 OpenAI messages 배열로 변환
    const messagesArr = history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const response = await callClaude(system, messagesArr);
    
    history.push({ role: 'npc', text: response });
    state.chatHistory[npcId] = history;
    
    // 호감도/꿈 진행도
    npc.affinity = Math.min(100, npc.affinity + 3);
    npc.dreamProgress = Math.min(100, npc.dreamProgress + 2);
    
    // 말풍선에 최근 메시지 임시 표시 (4초간)
    const meshData = npcMeshes[npcId];
    if (meshData) {
      const shortMsg = response.length > 20 ? response.substring(0, 20) + '...' : response;
      meshData.speechBubbleEl.textContent = `${npc.emoji} ${shortMsg}`;
      meshData.speechBubbleEl.classList.add('chatting');
      meshData.chatMessage = shortMsg;
      meshData.chatTimer = 4;
    }
    
    renderNpcList();
    renderContent();
  } catch (err) {
    showNotification('대화 오류가 발생했어요.');
  } finally {
    setLoading(false);
  }
}

async function advanceToNightAndMorning() {
  if (state.npcs.length === 0) {
    showNotification('먼저 주민을 한 명 이상 모아야 해요!');
    return;
  }
  if (state.loading) return;
  
  state.phase = 'night';
  state.timeOfDay = 0.95; // 밤
  
  setLoading(true, '밤이 깊어가고 있어요...');
  try {
    const nextDay = state.day + 1;
    const isStoryTriggerDay = (nextDay === 2) && state.storyStage === 'day1';
    const isQuestTriggerDay = (nextDay === 3) && state.storyStage === 'day2_triggered';
    
    const newReports = [];
    const newRumors = [];
    const newQuests = [];
    
    // ========== Day 2 진입: 서점 사건 오프닝 ==========
    if (isStoryTriggerDay) {
      setLoading(true, '동네에 이상한 기운이 흐르고 있어요...');
      
      // 시나리오 고정 리포트 3개
      const chaka = state.npcs.find(n => n.id === 'story_chaka');
      const yami = state.npcs.find(n => n.id === 'story_yami');
      const bamtol = state.npcs.find(n => n.id === 'story_bamtol');
      
      if (chaka) newReports.push({ day: nextDay, npcId: chaka.id, text: BOOKSTORE_STORY.chakaReport });
      if (yami) newReports.push({ day: nextDay, npcId: yami.id, text: BOOKSTORE_STORY.yamiReport });
      if (bamtol) newReports.push({ day: nextDay, npcId: bamtol.id, text: BOOKSTORE_STORY.bamtolReport });
      
      // 시나리오 고정 소문 (왜곡된 버전)
      if (yami) {
        newRumors.push({
          id: Date.now() + 1,
          day: nextDay,
          aboutNpcId: yami.id,
          text: BOOKSTORE_STORY.rumorText,
          isStory: true,
        });
        newRumors.push({
          id: Date.now() + 2,
          day: nextDay,
          aboutNpcId: yami.id,
          text: BOOKSTORE_STORY.rumorTextMild,
          isStory: true,
        });
      }
      
      // 호감도 변동
      if (bamtol) bamtol.affinity = Math.max(0, bamtol.affinity - 8);
      if (chaka) chaka.affinity = Math.max(0, chaka.affinity - 3);
      if (yami) yami.affinity = Math.max(0, yami.affinity - 5);
      // 야미 꿈 진행도 약간 후퇴 (소문으로 인한 타격)
      if (yami) yami.dreamProgress = Math.max(0, yami.dreamProgress - 10);
      
      // 일반 NPC 리포트도 소수 생성
      const nonStoryNpcs = state.npcs.filter(n => !n.isStory);
      for (const npc of nonStoryNpcs.slice(0, 2)) {
        const prompt = `${npc.species} ${npc.name}의 어젯밤 활동 한 줄 리포트. 직업:${npc.job}, 꿈:${npc.dream}. 25자 이내, "어젯밤"으로 시작, 호기심 훅 스타일. 답은 리포트 문장만.`;
        try {
          const text = await callClaude('너는 동네 관찰자야.', prompt);
          newReports.push({ day: nextDay, npcId: npc.id, text });
        } catch (e) {}
      }
      
      state.storyStage = 'day2_triggered';
    }
    // ========== Day 3 진입: 야미의 꿈 분기점 퀘스트 자동 발동 ==========
    else if (isQuestTriggerDay) {
      setLoading(true, '야미에게 중요한 순간이 다가오고 있어요...');
      
      const yami = state.npcs.find(n => n.id === 'story_yami');
      const bamtol = state.npcs.find(n => n.id === 'story_bamtol');
      
      // 후속 리포트
      if (yami) newReports.push({ day: nextDay, npcId: yami.id, text: '야미가 밤새 서점 앞을 서성였다는 이야기가 돌아요.' });
      if (bamtol) newReports.push({ day: nextDay, npcId: bamtol.id, text: '밤톨이 야미에게 독서모임 장소 대여를 거절했대요.' });
      
      // 꿈 분기점 퀘스트 (호감도 분기)
      if (yami) {
        const isFriendly = yami.affinity >= 50;
        const situation = isFriendly
          ? `야미가 당신에게 조용히 찾아와 털어놓아요. "책을 훔쳤다는 소문이 퍼져서 첫 독서 모임 장소로 빌리기로 했던 밤톨 서점에서도 거절당했다냥... 장부를 확인하면 내가 예약한 책이라는 게 드러날 텐데, 밤톨이 너무 화나서 들어주질 않아서... 꿈을 포기해야 할지도 모르겠다냥. 어떻게 해야 할까요?"`
          : `야미가 당신을 복잡한 눈빛으로 쳐다봐요. "다들 나를 도둑이라고 본다냥... 당신도 그렇게 보는 거죠? 독서 모임은 이제 못 열 것 같다냥. 밤톨한테 설명하고 싶은데 말 걸 용기도 안 나고... 내가 뭘 해야 할까요, 정말." 아직 당신을 완전히 믿지는 못하는 눈치에요.`;
        
        newQuests.push({
          id: Date.now() + 100,
          npcId: yami.id,
          day: nextDay,
          situation,
          relatedRumors: [BOOKSTORE_STORY.rumorText, BOOKSTORE_STORY.rumorTextMild],
          resolved: false, result: null,
          isStory: true,
          affinityRoute: isFriendly ? 'high' : 'low',
        });
      }
      
      state.storyStage = 'quest_active';
    }
    // ========== 일반 날짜: 기존 로직 그대로 ==========
    else {
      for (const npc of state.npcs) {
        setLoading(true, `${npc.name}의 밤을 관찰 중...`);
        const prompt = `${npc.species} ${npc.name}의 어젯밤 활동 한 줄 리포트를 만들어줘.

정보: 직업=${npc.job}, 꿈=${npc.dream}, 성격=${npc.personality}

규칙:
- 1문장, 최대 25자
- '왜'는 설명 X
- "어젯밤" 또는 "밤새" 로 시작
- 호기심 훅 스타일

답은 리포트 문장 하나만.`;
        try {
          const text = await callClaude('너는 동네 관찰자야.', prompt);
          newReports.push({ day: nextDay, npcId: npc.id, text });
        } catch (e) {}
      }
      
      // 소문 생성
      setLoading(true, '동네에 소문이 돌고 있어요...');
      for (const r of newReports) {
        if (Math.random() < 0.5) {
          const npc = state.npcs.find(n => n.id === r.npcId);
          const prompt = `다음 사실을 한 단계만 왜곡해서 귀여운 동네 소문으로 바꿔줘.
원본: ${r.text}
주인공: ${npc.name} ${npc.emoji}
규칙: 한 단어/맥락만 바꿔 오해, 25자 이내, 소문체.
답은 소문 문장 하나만.`;
          try {
            const rumorText = await callClaude('너는 수다쟁이야.', prompt);
            newRumors.push({ id: Date.now() + Math.random(), day: nextDay, aboutNpcId: r.npcId, text: rumorText });
          } catch (e) {}
        }
      }
      
      for (const npc of state.npcs) {
        const h = state.chatHistory[npc.id];
        if (h && h.length >= 2 && Math.random() < 0.3) {
          const recent = h.slice(-4).map(m => `${m.role === 'user' ? '유저' : npc.name}: ${m.text}`).join('\n');
          const prompt = `대화에서 소문거리를 찾아 한 단계 왜곡해. 없으면 "NONE".
대화:${recent}
주인공: ${npc.name}
규칙: 25자 이내.`;
          try {
            const rumorText = await callClaude('너는 수다쟁이야.', prompt);
            if (!rumorText.includes('NONE')) {
              newRumors.push({ id: Date.now() + Math.random(), day: nextDay, aboutNpcId: npc.id, text: rumorText });
            }
          } catch (e) {}
        }
      }
      
      // 소문 있는 NPC 퀘스트 (일반)
      const rumorNpcIds = [...new Set(newRumors.filter(r => !r.isStory).map(r => r.aboutNpcId))];
      for (const npcId of rumorNpcIds) {
        const npc = state.npcs.find(n => n.id === npcId);
        if (!npc || npc.isStory) continue; // 스토리 NPC는 별도 처리
        const targetRumors = newRumors.filter(r => r.aboutNpcId === npcId);
        const prompt = `${npc.name}의 꿈이 걸린 분기 퀘스트 상황을 만들어.

NPC: ${npc.name} (${npc.species} ${npc.emoji})
직업: ${npc.job}, 꿈: ${npc.dream}
성격: ${npc.personality}, 호감도: ${npc.affinity}/100

소문들:
${targetRumors.map(r => '- ' + r.text).join('\n')}

규칙: 2-3문장, 선택지 금지, 귀여운 톤, "어떻게 할까요?"로 끝.
답은 상황 설명만.`;
        try {
          const situation = await callClaude('너는 이벤트 디자이너야.', prompt);
          newQuests.push({
            id: Date.now() + Math.random(),
            npcId, day: nextDay,
            situation,
            relatedRumors: targetRumors.map(r => r.text),
            resolved: false, result: null,
          });
        } catch (e) {}
      }
    }
    
    // 상태 반영
    state.reports.push(...newReports);
    state.rumors.push(...newRumors);
    state.quests.push(...newQuests);
    state.day = nextDay;
    state.phase = 'morning';
    state.timeOfDay = 0.3;
    state.activeTab = 'report';
    
    showNotification(`🌅 ${nextDay}일차 아침이 밝았어요!`);
    renderTabs();
    renderContent();
    renderCounts();
    renderNpcList();
    
    // 스토리 모달 표시
    if (isStoryTriggerDay) {
      // 증거 이미지 체인: 사진관 쇼윈도 → 빈 선반 → 장부 → 스토리 모달
      setTimeout(() => {
        showEvidencePopup('photostudio_window', '사진관 쇼윈도에 걸린 한 장의 사진...');
      }, 500);
      setTimeout(() => {
        window.__closeEvidence();
        setTimeout(() => showEvidencePopup('missing_book_shelf', '서점 선반에서 책 한 권이 사라졌다!'), 300);
      }, 3500);
      setTimeout(() => {
        window.__closeEvidence();
        setTimeout(() => showEvidencePopup('bamtol_ledger', '밤톨이 확인한 장부. 뭔가 이상하다...'), 300);
      }, 6500);
      setTimeout(() => {
        window.__closeEvidence();
        setTimeout(() => showStoryModal(BOOKSTORE_STORY.day2Opening.title, BOOKSTORE_STORY.day2Opening.body), 400);
      }, 9500);
    } else if (isQuestTriggerDay) {
      setTimeout(() => showStoryModal(
        '📖 야미가 당신을 찾아왔어요',
        '야미의 꿈("독서 모임 만들기")이 분기점에 섰어요. 사건 탭에서 야미와 마주하고 직접 행동을 적어보세요.\n\n호감도가 높으면 야미가 먼저 속마음을 털어놓고, 낮으면 당신도 의심할 거예요.'
      ), 800);
    }
  } catch (err) {
    showNotification('시뮬레이션 오류가 발생했어요.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

async function submitQuestAction(text) {
  if (!text.trim() || !state.activeQuestId || state.loading) return;
  const quest = state.quests.find(q => q.id == state.activeQuestId);
  if (!quest) return;
  const npc = state.npcs.find(n => n.id === quest.npcId);
  
  setLoading(true, '상황을 판정하는 중...');
  try {
    const prompt = `유저의 자유 행동을 3축으로 판정해.

상황: ${quest.situation}

NPC: ${npc.name} (꿈=${npc.dream}, 꿈진행도=${npc.dreamProgress}%, 호감도=${npc.affinity}/100)
소문: ${quest.relatedRumors.join(' / ')}

유저 행동: "${text.trim()}"

JSON으로만 답해:
{
  "narrative": "2-3문장. 귀여운 톤. NPC 반응 포함.",
  "dreamAxis": "forward" | "detour" | "backward",
  "dreamDelta": -30~+30 숫자,
  "rumorAxis": "resolve" | "ignore" | "worsen",
  "affinityDelta": -20~+20 숫자,
  "resultLabel": "결과 요약 (20자 이내)"
}`;
    const data = await callClaude('너는 자유행동 판정 시스템이야.', prompt, true);
    
    npc.dreamProgress = Math.max(0, Math.min(100, npc.dreamProgress + data.dreamDelta));
    npc.affinity = Math.max(0, Math.min(100, npc.affinity + data.affinityDelta));
    quest.resolved = true;
    quest.result = data;
    quest.userAction = text.trim();
    
    // 스토리 퀘스트 해결 시 증거 팝업 체인
    if (quest.isStory && quest.affinityRoute === 'high' && data.dreamAxis === 'forward') {
      // 호감도 높음 + 성공 → 증거 1(예약증) + 증거 2(선반 밑 발견) 팝업
      if (/장부|예약|확인/.test(text)) {
        setTimeout(() => showEvidencePopup('book_reservation_slip', '증거 1: 야미의 예약증이 발견됐어요!'), 800);
        setTimeout(() => {
          window.__closeEvidence();
          setTimeout(() => showEvidencePopup('missing_book_found', '증거 2: 선반 밑에서 사라진 책을 찾았어요!'), 400);
        }, 3500);
      } else if (/서점|뒤져|찾아/.test(text)) {
        setTimeout(() => showEvidencePopup('missing_book_found', '밤톨과 함께 서점을 뒤지다가 찾았어요!'), 800);
      } else {
        setTimeout(() => showEvidencePopup('book_reservation_slip', '예약증이 발견됐어요!'), 800);
      }
    }
    
    // 스토리 퀘스트 해결 시 스토리 단계 완료
    if (quest.isStory && state.storyStage === 'quest_active') {
      state.storyStage = 'resolved';
      // 결과에 따른 스토리 에필로그
      setTimeout(() => {
        let epilogueTitle, epilogueBody;
        if (data.dreamAxis === 'forward') {
          epilogueTitle = '🌸 사건이 해결됐어요';
          epilogueBody = `야미의 독서 모임이 다시 길을 찾았어요.\n\n${data.resultLabel}\n\n동네는 다시 평화를 찾았고, 밤톨도 자신의 성급함을 반성하게 됐어요.`;
        } else if (data.dreamAxis === 'backward') {
          epilogueTitle = '🥀 야미의 꿈이 흔들렸어요';
          epilogueBody = `오해는 풀리지 않았고, 야미의 독서 모임은 당분간 미뤄졌어요.\n\n${data.resultLabel}\n\n하지만 세계는 계속 돌아가요. 언젠가 다시 기회가 올지도...`;
        } else {
          epilogueTitle = '🌾 사건이 한 걸음 비껴갔어요';
          epilogueBody = `직접적 해결은 없었지만, 야미는 다른 길을 찾을 준비를 해요.\n\n${data.resultLabel}`;
        }
        showStoryModal(epilogueTitle, epilogueBody);
      }, data.dreamAxis === 'forward' ? 7000 : 1500);
    }
    
    showNotification(`✨ ${data.resultLabel}`);
    renderNpcList();
    renderContent();
    renderCounts();
  } catch (err) {
    showNotification('판정 오류가 발생했어요.');
  } finally {
    setLoading(false);
  }
}

// =========================================================
// UI 렌더링
// =========================================================
function renderCounts() {
  document.getElementById('npc-count').textContent = `주민 ${state.npcs.length}명`;
  const unresolved = state.quests.filter(q => !q.resolved).length;
  const qc = document.getElementById('quest-count');
  const qd = document.getElementById('quest-dot');
  if (unresolved > 0) {
    qc.style.display = 'inline-block';
    qc.textContent = `사건 ${unresolved}건`;
    qd.style.display = 'inline-block';
  } else {
    qc.style.display = 'none';
    qd.style.display = 'none';
  }
}

function renderNpcList() {
  const list = document.getElementById('npc-list');
  if (state.npcs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="big-emoji">🎁</span>가챠를 돌려<br>첫 주민을 만나봐요!</div>';
    return;
  }
  list.innerHTML = state.npcs.map(n => `
    <div class="npc-card ${state.selectedNpcId == n.id ? 'selected' : ''} ${n.isStory ? 'story' : ''}" data-npc-id="${n.id}">
      <div class="npc-emoji">${n.emoji}</div>
      <div class="npc-info">
        <div class="npc-name">${n.name} <span class="stars">${'★'.repeat(n.level)}</span></div>
        <div class="npc-job">${n.job}</div>
        <div class="progress-row">
          <span class="heart-indicator">♥ ${n.affinity}</span>
          <div class="dream-bar"><div class="dream-fill" style="width:${n.dreamProgress}%"></div></div>
        </div>
        ${n.dream ? `<div style="font-size:9px; color:#c44536; margin-top:2px; font-style:italic">✦ ${n.dream}</div>` : ''}
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.npc-card').forEach(el => {
    el.addEventListener('click', () => {
      // 시뮬레이션 중이면 상호작용 차단
      if (state.simulation.active) {
        showNotification('💤 자는 동안은 상호작용할 수 없어요');
        return;
      }
      const npcId = parseInt(el.dataset.npcId);
      // 인테리어에 있으면 근접 체크 없이 바로 대화
      if (state.viewMode === 'interior') {
        selectNpc(npcId);
        return;
      }
      // 동네 뷰: 근접하지 않으면 자동 이동 후 대화
      if (!state.user.mesh) { selectNpc(npcId); return; }
      const dist = distanceToNpc(npcId);
      if (dist <= INTERACTION_RANGE) {
        selectNpc(npcId);
      } else {
        const npc = state.npcs.find(n => n.id == npcId);
        const name = npc?.name || 'NPC';
        showNotification(`🏃 ${name}에게 다가가는 중...`);
        const npcMesh = npcMeshes[npcId].mesh;
        moveUserTo(npcMesh.position.x, npcMesh.position.z, {
          stopDistance: INTERACTION_RANGE * 0.85,
          pendingNpcId: npcId,
          onArrive: (arrivedNpcId) => {
            if (distanceToNpc(arrivedNpcId) <= INTERACTION_RANGE) {
              selectNpc(arrivedNpcId);
            } else {
              showNotification(`${name}이(가) 이동했어요. 다시 시도해주세요.`);
            }
          },
        });
      }
    });
  });
}

function renderTabs() {
  document.querySelectorAll('.tab-bar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === state.activeTab);
  });
}

function renderContent() {
  const el = document.getElementById('tab-content');
  if (state.activeTab === 'chat') {
    const npc = state.npcs.find(n => n.id == state.selectedNpcId);
    if (!npc) {
      el.innerHTML = '<div class="empty-state"><span class="big-emoji">💬</span>좌측이나 맵에서<br>주민을 선택해보세요</div>';
      return;
    }
    const history = state.chatHistory[npc.id] || [];
    el.innerHTML = `
      <div style="padding-bottom:8px; border-bottom:1px solid #f0e4d4; margin-bottom:8px">
        <div style="display:flex; align-items:center; gap:8px">
          <div style="font-size:24px">${npc.emoji}</div>
          <div>
            <div style="font-weight:700; font-size:13px; color:#6b4423">${npc.name}</div>
            <div style="font-size:10px; color:#9c7a5a">${npc.job} · ${npc.personality}</div>
          </div>
        </div>
        <div style="font-size:10px; color:#9c7a5a; margin-top:4px">
          꿈: ${npc.dream} ${npc.level >= 2 ? `· ${npc.level >= 3 ? `✨ ${npc.secretSkill}` : '비밀이 있는 것 같다...'}` : ''}
        </div>
      </div>
      <div class="chat-messages" id="chat-messages">
        ${history.length === 0 ? '<div class="empty-state" style="padding:20px"><span class="big-emoji" style="font-size:24px">💬</span>'+npc.name+'에게 말을 걸어봐요</div>' : ''}
        ${history.map(m => `<div class="chat-msg ${m.role}">${m.role === 'npc' ? npc.emoji + ' ' : ''}${escapeHtml(m.text)}</div>`).join('')}
      </div>
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="메시지를 입력하세요..." />
        <button class="send-btn" id="send-btn">➤</button>
      </div>
    `;
    const input = document.getElementById('chat-input');
    const send = document.getElementById('send-btn');
    const doSend = () => { const v = input.value; input.value = ''; sendChatMessage(v); };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
    const cm = document.getElementById('chat-messages');
    if (cm) cm.scrollTop = cm.scrollHeight;
  }
  else if (state.activeTab === 'report') {
    const today = state.reports.filter(r => r.day === state.day);
    const older = state.reports.filter(r => r.day < state.day).slice(-10).reverse();
    el.innerHTML = `
      <div class="section-title">📜 아침 리포트 · Day ${state.day}</div>
      ${today.length === 0 ? '<div class="empty-state"><span class="big-emoji">☀️</span>아직 리포트가 없어요.<br>"밤으로" 버튼을 눌러 다음 날을 시작해보세요.</div>' : 
        today.map(r => {
          const npc = state.npcs.find(n => n.id === r.npcId);
          return `<div class="report-item"><div>${npc?.emoji || '❓'}</div><div>${escapeHtml(r.text)}</div></div>`;
        }).join('')
      }
      ${older.length > 0 ? `
        <details style="margin-top:12px">
          <summary style="cursor:pointer; font-size:11px; color:#9c7a5a">이전 리포트 보기</summary>
          <div style="margin-top:6px">
            ${older.map(r => {
              const npc = state.npcs.find(n => n.id === r.npcId);
              return `<div class="report-item" style="opacity:0.7; font-size:11px"><div>${npc?.emoji}</div><div><span style="color:#9c7a5a">Day ${r.day}:</span> ${escapeHtml(r.text)}</div></div>`;
            }).join('')}
          </div>
        </details>
      ` : ''}
    `;
  }
  else if (state.activeTab === 'board') {
    const rumors = [...state.rumors].reverse();
    el.innerHTML = `
      <div class="section-title">📢 동네 소문 게시판</div>
      ${rumors.length === 0 ? '<div class="empty-state"><span class="big-emoji">📜</span>아직 소문이 없어요.<br>주민과 어울리고 밤을 보내면 소문이 돌아요.</div>' : `
        <div class="rumor-board">
          <div class="rumor-board-title">── 🏘️ 우리 동네 소식 ──</div>
          ${rumors.map(r => {
            const npc = state.npcs.find(n => n.id === r.aboutNpcId);
            const isNew = r.day === state.day;
            const isStory = r.isStory;
            return `<div class="rumor-note ${isStory ? 'story' : ''} ${isNew ? 'new-tag' : ''}">
              <div style="display:flex; align-items:flex-start; gap:6px">
                <div style="font-size:18px">${npc?.emoji || '❓'}</div>
                <div style="flex:1">${escapeHtml(r.text)}</div>
              </div>
              <div class="rumor-meta">
                <span>Day ${r.day} · ${npc?.name || '?'}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    `;
  }
  else if (state.activeTab === 'quest') {
    if (state.activeQuestId) {
      const q = state.quests.find(x => x.id == state.activeQuestId);
      if (!q) { state.activeQuestId = null; renderContent(); return; }
      const npc = state.npcs.find(n => n.id === q.npcId);
      el.innerHTML = `
        <button class="btn btn-small" id="back-quest" style="margin-bottom:10px">← 목록으로</button>
        <div class="quest-detail">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px">
            <div style="font-size:22px">${npc?.emoji}</div>
            <div style="font-weight:700">${npc?.name}의 사건</div>
          </div>
          <div>${escapeHtml(q.situation)}</div>
          ${q.relatedRumors.length > 0 ? `
            <div class="quest-rumors">
              <div>관련 소문:</div>
              ${q.relatedRumors.map(r => `<div>· ${escapeHtml(r)}</div>`).join('')}
            </div>
          ` : ''}
        </div>
        ${q.resolved ? `
          <div class="quest-action">당신의 행동: "${escapeHtml(q.userAction)}"</div>
          <div class="quest-result">
            <div>${escapeHtml(q.result.narrative)}</div>
            <div class="quest-axes">
              <span class="axis-chip">꿈: ${q.result.dreamAxis === 'forward' ? '🌱 전진' : q.result.dreamAxis === 'backward' ? '🥀 후퇴' : '🌾 우회'} (${q.result.dreamDelta > 0 ? '+' : ''}${q.result.dreamDelta})</span>
              <span class="axis-chip">소문: ${q.result.rumorAxis === 'resolve' ? '🕊️ 해소' : q.result.rumorAxis === 'worsen' ? '🔥 악화' : '💭 무시'}</span>
              <span class="axis-chip">관계: ${q.result.affinityDelta > 0 ? '💗' : q.result.affinityDelta < 0 ? '💔' : '❤️'} ${q.result.affinityDelta > 0 ? '+' : ''}${q.result.affinityDelta}</span>
            </div>
          </div>
        ` : `
          <div style="font-size:11px; color:#9c7a5a; margin-bottom:4px">어떻게 할까요? (비워두면 방관)</div>
          <textarea class="quest-input" id="quest-input" placeholder="예: 밤톨에게 장부를 함께 확인하자고 설득한다 / 함께 서점을 뒤져본다 / 차카에게 사진의 맥락을 물어본다"></textarea>
          <button class="btn btn-primary" id="quest-submit" style="width:100%; margin-top:8px">행동하기</button>
        `}
      `;
      document.getElementById('back-quest').addEventListener('click', () => { state.activeQuestId = null; renderContent(); });
      if (!q.resolved) {
        document.getElementById('quest-submit').addEventListener('click', () => {
          const v = document.getElementById('quest-input').value;
          submitQuestAction(v);
        });
      }
    } else {
      const quests = [...state.quests].reverse();
      const evidenceList = ASSET_SLOTS.evidence;
      el.innerHTML = `
        <div class="section-title">📦 증거 보관함</div>
        <div class="evidence-grid" style="margin-bottom:14px">
          ${evidenceList.map(key => {
            const meta = ASSET_META[key] || { emoji: '🔍', label: key === 'missing_book_found' ? '선반 밑의 책' : key };
            const collected = collectedEvidence.has(key);
            const img = assetRegistry[key];
            return `<div class="evidence-slot ${collected ? 'collected' : 'locked'}" data-key="${key}">
              <div class="evidence-slot-thumb">${collected && img ? `<img src="${img}" />` : (collected ? meta.emoji : '🔒')}</div>
              <div class="evidence-slot-name">${collected ? meta.label : '???'}</div>
            </div>`;
          }).join('')}
        </div>
        
        <div class="section-title">📖 동네 사건</div>
        ${quests.length === 0 ? '<div class="empty-state"><span class="big-emoji">📖</span>아직 사건이 없어요.<br>소문이 돈 다음 날 사건이 생겨요.</div>' :
          quests.map(q => {
            const npc = state.npcs.find(n => n.id === q.npcId);
            return `<div class="quest-item ${q.resolved ? 'resolved' : ''}" data-quest-id="${q.id}">
              <div style="display:flex; align-items:center; gap:6px">
                <div style="font-size:20px">${npc?.emoji}</div>
                <div style="font-weight:700; font-size:12px">${npc?.name}의 사건
                  ${!q.resolved ? '<span style="color:#e63946; margin-left:4px">●NEW</span>' : '<span style="color:#888; margin-left:4px; font-size:10px">✓ 완료</span>'}
                </div>
              </div>
              <div style="font-size:11px; color:#9c7a5a; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${escapeHtml(q.situation)}</div>
              <div style="font-size:10px; color:#b59878">Day ${q.day}</div>
            </div>`;
          }).join('')
        }
      `;
      // 증거 슬롯 클릭 시 팝업
      el.querySelectorAll('.evidence-slot.collected').forEach(slot => {
        slot.addEventListener('click', () => {
          const key = slot.dataset.key;
          const meta = ASSET_META[key] || { label: key };
          showEvidencePopup(key, meta.label);
        });
      });
      el.querySelectorAll('.quest-item').forEach(item => {
        item.addEventListener('click', () => {
          state.activeQuestId = parseFloat(item.dataset.questId);
          renderContent();
        });
      });
    }
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 탭 이벤트
document.querySelectorAll('.tab-bar button').forEach(b => {
  if (!b.dataset.tab) return;
  b.addEventListener('click', () => {
    state.activeTab = b.dataset.tab;
    if (b.dataset.tab !== 'quest') state.activeQuestId = null;
    renderTabs();
    renderContent();
  });
});

// =========================================================
// 인트로 가챠 (전역 함수로 노출 - onclick에서 호출)
// =========================================================
// 5회 가챠 시퀀스 (고정 NPC 5명을 섞어서 뽑기 연출)
let introDrawSequence = null;
let introDrawIndex = 0;
