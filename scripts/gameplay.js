function selectNpc(npcId) {
  const npc = state.npcs.find(n => n.id == npcId);
  if (!npc) return;

  // [6단계] 시나리오 엔진에 NPC 접근 알림.
  // 활성 낮 이벤트가 있으면 엔진이 발동시킴 (증거 팝업, 호감도 변동, 소문 등).
  // 없으면 조용히 리턴하므로 기존 흐름에 영향 없음.
  // 엔진 로드 실패 시 대비해 방어적으로 호출.
  try {
    if (window.scenarioEngine && typeof window.scenarioEngine.handleNpcApproach === 'function') {
      window.scenarioEngine.handleNpcApproach(npcId);
    }
  } catch (err) {
    console.error('[gameplay] scenarioEngine.handleNpcApproach 호출 중 에러 (무시하고 진행):', err);
  }

  // 시나리오 NPC는 제타 스타일 팝업 채팅
  if (npc.isStory && ['chaka', 'yami', 'bamtol'].includes(npc.id)) {
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

// =========================================================
// (제거됨) rollGacha 함수
// - 기존 동물 풀(ANIMALS) 기반 랜덤 가챠 로직은 더 이상 사용하지 않음
// - 시나리오 NPC 5명이 게임 시작 시 고정 등장하는 구조로 변경됨
// =========================================================

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
    // [8단계 제거] storyStage 기반 하드코딩 storyContext 블록 삭제.
    //              엔진의 getDialogueContext 가 전담 (아래 engineContext).

    const speciesTag = npc.species ? ` (${npc.species} ${npc.emoji || ''})` : '';
    const system = `너는 아기자기한 동네 게임의 NPC다. 캐주얼하고 자연스러운 톤으로 짧게 대답해.

너의 정보:
- 이름: ${npc.name}${speciesTag}
- 직업: ${npc.job}
- 꿈: ${npc.dream} (${npc.dreamProgress}%)
- 성격: ${npc.personality}
- 말버릇: "${npc.speechHabit}" (자주 섞어)
- 호감도: ${npc.affinity}/100

규칙:
- 1-2문장만
- 말버릇을 자주 붙여
- 호감도 낮으면 거리감 있게, 높으면 친근하게
- 최근 동네 소문을 꺼낼 수도 있음

최근 동네 소문: ${state.rumors.slice(-3).map(r => r.text).join(' / ') || '없음'}`;

    // [7단계] 엔진 배경 concat. [8단계] 하드코딩 제거로 엔진이 storyContext 전담.
    let engineContext = '';
    try {
      if (window.scenarioEngine && typeof window.scenarioEngine.getDialogueContext === 'function') {
        engineContext = window.scenarioEngine.getDialogueContext(npcId) || '';
      }
    } catch (err) {
      console.error('[sendChatMessage] getDialogueContext 에러 (무시):', err);
    }
    const systemFinal = system + engineContext;

    // history를 OpenAI messages 배열로 변환
    const messagesArr = history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const response = await callClaude(systemFinal, messagesArr);
    
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

// [8단계 재작성] advanceToNightAndMorning
// 이전 버전: Day 2/3 진입 시 isStoryTriggerDay / isQuestTriggerDay 분기로 하드코딩 리포트/소문/
//            퀘스트 생성 + 증거 팝업 체인 + 스토리 모달을 직접 띄웠다 (storyStage 수동 갱신 포함).
// 새 버전:
//   1. 먼저 엔진의 runNightSimulation({ dryRun: false }) 호출.
//      - 현재 단계에 해당하는 밤 씨앗이 있으면 AI 로 장면 생성 + effects 실행 (호감도/증거팝업/소문).
//      - sleepCount 도 +1 해 준다.
//      - 씨앗 없는 단계(resolved)는 빈 결과로 즉시 반환됨.
//   2. 엔진의 checkStageTransition() 호출.
//      - 전환 조건 충족 시 _transitionStage 가 자동으로 새 단계로 이동 + autoOnStageEnter 이벤트 발동.
//      - 이걸로 Day 2 진입 시 증거 팝업/스토리 모달/퀘스트 발동이 시나리오 데이터 기반으로 처리됨.
//   3. 일반 날짜용 리포트/소문/NPC 퀘스트 생성 로직은 "시나리오 엔진이 stage transition 을 만들지 않은
//      날"에 한해 기존대로 실행 (Q1=B 결정).
//   4. 마지막에 state.day 증가 + UI 갱신.
//
// 제거된 것:
//   - isStoryTriggerDay / isQuestTriggerDay 분기 전체
//   - BOOKSTORE_STORY.* 참조 (chakaReport/yamiReport/bamtolReport/rumorText/day2Opening 등)
//   - state.storyStage 갱신 코드 (엔진이 전담)
//   - 증거 팝업 setTimeout 체인 (엔진 autoOnStageEnter 가 대체, UI 큐로 순차 표시)
//   - 야미 퀘스트 모달 (엔진 triggerQuest effect 가 대체)
async function advanceToNightAndMorning() {
  if (state.loading) return;

  state.phase = 'night';
  state.timeOfDay = 0.95;

  setLoading(true, '밤이 깊어가고 있어요...');
  try {
    const nextDay = state.day + 1;

    // ─── Phase 1: 시나리오 엔진 밤 시뮬 ───
    let engineBeforeStage = null;
    let nightResult = null;
    try {
      if (window.scenarioEngine && typeof window.scenarioEngine.runNightSimulation === 'function') {
        engineBeforeStage = window.scenarioEngine.currentStage;
        setLoading(true, '동네의 밤을 관찰하고 있어요...');
        nightResult = await window.scenarioEngine.runNightSimulation({ dryRun: false });
      }
    } catch (err) {
      console.error('[advance] runNightSimulation 에러 (무시하고 진행):', err);
    }

    // ─── Phase 2: 단계 전환 체크 ───
    let stageTransitioned = false;
    try {
      if (window.scenarioEngine && typeof window.scenarioEngine.checkStageTransition === 'function') {
        const newStage = window.scenarioEngine.checkStageTransition();
        if (newStage && newStage !== engineBeforeStage) {
          stageTransitioned = true;
          console.log('[advance] 엔진 단계 전환:', engineBeforeStage, '→', newStage);
        }
      }
    } catch (err) {
      console.error('[advance] checkStageTransition 에러 (무시하고 진행):', err);
    }

    // ─── Phase 3: 일반 날짜 리포트/소문/NPC 퀘스트 생성 (Q1=B) ───
    const newReports = [];
    const newRumors = [];
    const newQuests = [];

    if (!stageTransitioned) {
      for (const npc of state.npcs) {
        setLoading(true, `${npc.name}의 밤을 관찰 중...`);
        const speciesPrefix = npc.species ? `${npc.species} ` : '';
        const prompt = `${speciesPrefix}${npc.name}의 어젯밤 활동 한 줄 리포트를 만들어줘.

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

      const rumorNpcIds = [...new Set(newRumors.filter(r => !r.isStory).map(r => r.aboutNpcId))];
      for (const npcId of rumorNpcIds) {
        const npc = state.npcs.find(n => n.id === npcId);
        if (!npc || npc.isStory) continue;
        const targetRumors = newRumors.filter(r => r.aboutNpcId === npcId);
        const prompt = `${npc.name}의 꿈이 걸린 분기 퀘스트 상황을 만들어.

NPC: ${npc.name} (${npc.emoji})
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
    } else {
      // 스토리 전환이 일어난 날: 엔진 씨앗 결과를 리포트로 변환 (빈 탭 방지).
      // [8단계 개선] 씨앗 정의의 primaryNpcId 를 리포트의 npcId 로 사용 → UI가 NPC 이모지/이름 찾을 수 있음.
      // engineBeforeStage 는 Phase 1 이전 단계. 그 단계의 씨앗들을 조회해서 primaryNpcId 매핑.
      if (nightResult && Array.isArray(nightResult.reports)) {
        let seedsLookup = [];
        try {
          const scen = window.scenarioEngine && window.scenarioEngine.scenario;
          if (scen && scen.nightSeeds && engineBeforeStage && scen.nightSeeds[engineBeforeStage]) {
            seedsLookup = scen.nightSeeds[engineBeforeStage];
          }
        } catch (e) { /* ignore */ }

        for (const r of nightResult.reports) {
          if (r && r.line) {
            const seedDef = seedsLookup.find(s => s.id === r.seedId);
            const resolvedNpcId = seedDef && seedDef.primaryNpcId ? seedDef.primaryNpcId : null;
            newReports.push({ day: nextDay, npcId: resolvedNpcId, text: r.line });
          }
        }
      }
    }

    // ─── Phase 4: 상태 반영 + UI 갱신 ───
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
    renderQuestBanner(); // [9단계] 밤 지난 후 배너 갱신 (단계 전환됐을 수 있음)

    // 스토리 연출 하드코딩 제거됨. 엔진 autoOnStageEnter 가 증거팝업/스토리모달/퀘스트
    // 전부 담당하며 UI 큐를 통해 순차 표시됨.
  } catch (err) {
    showNotification('시뮬레이션 오류가 발생했어요.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// [9단계 제거] submitQuestAction — 자유 행동 입력 방식 폐기.
// 이제 퀘스트 해결은 엔진의 evaluateQuestMilestones 가 zeta 대화창 닫을 때 판정함.
// 스토리 퀘스트 해결 → resolvedQuests 추가 → checkStageTransition 까지 엔진 내부에서 처리.

// =========================================================
// NPC 카드/대화창용 헬퍼 — natural 이미지 우선, 없으면 이모지 폴백
// =========================================================
function getNpcAvatarHtml(npc, sizeClass) {
  const naturalKey = `${npc.id}_natural`;
  const img = (window.PRELOADED_ASSETS || {})[naturalKey];
  if (img) {
    // sizeClass에 따라 인라인 스타일 적용
    const style = sizeClass === 'small'
      ? 'width:36px; height:36px; object-fit:cover; border-radius:50%;'
      : 'width:44px; height:44px; object-fit:cover; border-radius:50%;';
    return `<img src="${img}" style="${style}" alt="${npc.name}" />`;
  }
  return npc.emoji || '👤';
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
    qc.textContent = `퀘스트 ${unresolved}건`;
    qd.style.display = 'inline-block';
  } else {
    qc.style.display = 'none';
    qd.style.display = 'none';
  }
  // [9단계] 배너도 같이 갱신
  renderQuestBanner();
}

// [9단계] 화면 상단 퀘스트 배너 렌더링.
// 엔진의 getCurrentBannerText 가 현재 단계 + 마일스톤 상태 기반으로 텍스트를 줌.
// text 가 빈 문자열이면 배너를 완전히 숨긴다.
function renderQuestBanner() {
  const banner = document.getElementById('quest-banner');
  if (!banner) return;
  if (!window.scenarioEngine || typeof window.scenarioEngine.getCurrentBannerText !== 'function') {
    banner.style.display = 'none';
    return;
  }
  let info;
  try {
    info = window.scenarioEngine.getCurrentBannerText();
  } catch (err) {
    console.error('[banner] getCurrentBannerText 에러:', err);
    banner.style.display = 'none';
    return;
  }
  if (!info || !info.text) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  const textEl = banner.querySelector('.banner-text');
  const progressEl = banner.querySelector('.banner-progress');
  if (textEl) textEl.textContent = info.text;
  if (progressEl) {
    if (info.threshold > 0) {
      progressEl.textContent = `(${info.achieved}/${info.threshold})`;
      progressEl.style.display = 'inline';
    } else {
      progressEl.style.display = 'none';
    }
  }
  // 텍스트 바뀜 감지용: 이전 값 저장해서 달라졌으면 깜빡 효과
  const prevText = banner.dataset.prevText || '';
  if (prevText !== info.text) {
    banner.classList.remove('highlight');
    void banner.offsetWidth; // reflow 강제
    banner.classList.add('highlight');
    banner.dataset.prevText = info.text;
  }
}

function renderNpcList() {
  const list = document.getElementById('npc-list');
  if (state.npcs.length === 0) {
    // 이제 5명 고정 등장 구조라 이 분기에 도달할 일은 거의 없음
    list.innerHTML = '<div class="empty-state"><span class="big-emoji">🏘️</span>동네를 시작해보세요</div>';
    return;
  }
  list.innerHTML = state.npcs.map(n => `
    <div class="npc-card ${state.selectedNpcId == n.id ? 'selected' : ''} ${n.isStory ? 'story' : ''}" data-npc-id="${n.id}">
      <div class="npc-emoji">${getNpcAvatarHtml(n, 'small')}</div>
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
      // id는 문자열(chaka 등) 또는 숫자일 수 있으므로 원본 그대로 사용
      const npcId = el.dataset.npcId;
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
          <div>${getNpcAvatarHtml(npc, 'medium')}</div>
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
          const npc = r.npcId ? state.npcs.find(n => n.id === r.npcId) : null;
          return `<div class="report-item"><div>${npc?.emoji || '📜'}</div><div>${escapeHtml(r.text)}</div></div>`;
        }).join('')
      }
      ${older.length > 0 ? `
        <details style="margin-top:12px">
          <summary style="cursor:pointer; font-size:11px; color:#9c7a5a">이전 리포트 보기</summary>
          <div style="margin-top:6px">
            ${older.map(r => {
              const npc = r.npcId ? state.npcs.find(n => n.id === r.npcId) : null;
              return `<div class="report-item" style="opacity:0.7; font-size:11px"><div>${npc?.emoji || '📜'}</div><div><span style="color:#9c7a5a">Day ${r.day}:</span> ${escapeHtml(r.text)}</div></div>`;
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
      // [9단계] 스토리 퀘스트일 때 마일스톤 진행도 + 달성 체크리스트 표시
      let milestonesHtml = '';
      let guidanceHtml = '';
      if (q.isStory && window.scenarioEngine && window.scenarioEngine.scenario) {
        const qdef = (window.scenarioEngine.scenario.quests || {})[q.id];
        if (qdef && Array.isArray(qdef.milestones)) {
          const achievedSet = (window.scenarioEngine.state.questMilestones || {})[q.id] || new Set();
          const total = qdef.milestones.length;
          const achievedCount = achievedSet.size;
          const threshold = qdef.resolveThreshold || total;
          milestonesHtml = `
            <div class="quest-milestones">
              <div class="milestone-header">진행도 ${achievedCount}/${threshold}</div>
              ${qdef.milestones.map(m => {
                const done = achievedSet.has(m.id);
                return `<div class="milestone-row ${done ? 'done' : ''}">
                  <span class="milestone-check">${done ? '✅' : '⬜'}</span>
                  <span class="milestone-text">${escapeHtml(m.description)}</span>
                </div>`;
              }).join('')}
            </div>`;
        }
        if (!q.resolved) {
          const targetNpc = state.npcs.find(n => n.id === q.npcId);
          guidanceHtml = `
            <div class="quest-guidance">
              💬 ${escapeHtml(targetNpc?.name || '주민')}와 대화하거나, 관련 주민들과 이야기하며 오해를 풀어보세요.
            </div>`;
        }
      }

      el.innerHTML = `
        <button class="btn btn-small" id="back-quest" style="margin-bottom:10px">← 목록으로</button>
        <div class="quest-detail">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px">
            <div style="font-size:22px">${npc?.emoji}</div>
            <div style="font-weight:700">${npc?.name}의 퀘스트</div>
          </div>
          <div>${escapeHtml(q.situation)}</div>
          ${(q.relatedRumors && q.relatedRumors.length > 0) ? `
            <div class="quest-rumors">
              <div>관련 소문:</div>
              ${q.relatedRumors.map(r => `<div>· ${escapeHtml(r)}</div>`).join('')}
            </div>
          ` : ''}
        </div>
        ${milestonesHtml}
        ${q.resolved ? `
          <div class="quest-result">
            <div>${escapeHtml((q.result && q.result.narrative) || '오해가 풀렸어요.')}</div>
          </div>
        ` : guidanceHtml}
      `;
      document.getElementById('back-quest').addEventListener('click', () => { state.activeQuestId = null; renderContent(); });
    } else {
      const quests = [...state.quests].reverse();
      // [8단계] 증거 보관함 UI 제거 (유저 노출 안 함). ASSET_SLOTS/ASSET_META/assetRegistry
      //         내부 구조는 유지 — showEvidencePopup 이 여전히 사용.
      //         "동네 사건" → "퀘스트" 로 라벨 변경.
      el.innerHTML = `
        <div class="section-title">📖 퀘스트</div>
        ${quests.length === 0 ? '<div class="empty-state"><span class="big-emoji">📖</span>아직 퀘스트가 없어요.<br>소문이 돈 다음 날 퀘스트가 생겨요.</div>' :
          quests.map(q => {
            const npc = state.npcs.find(n => n.id === q.npcId);
            return `<div class="quest-item ${q.resolved ? 'resolved' : ''}" data-quest-id="${q.id}">
              <div style="display:flex; align-items:center; gap:6px">
                <div style="font-size:20px">${npc?.emoji}</div>
                <div style="font-weight:700; font-size:12px">${npc?.name}의 퀘스트
                  ${!q.resolved ? '<span style="color:#e63946; margin-left:4px">●NEW</span>' : '<span style="color:#888; margin-left:4px; font-size:10px">✓ 완료</span>'}
                </div>
              </div>
              <div style="font-size:11px; color:#9c7a5a; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${escapeHtml(q.situation)}</div>
              <div style="font-size:10px; color:#b59878">Day ${q.day}</div>
            </div>`;
          }).join('')
        }
      `;
      el.querySelectorAll('.quest-item').forEach(item => {
        item.addEventListener('click', () => {
          // [8단계 버그픽스] 기존에 parseFloat 사용 → 엔진의 triggerQuest 가 문자열 ID
          // ('yami_dream_crisis') 를 넣으면 NaN 반환되어 find 실패 → 클릭 무반응.
          // dataset 은 늘 문자열이므로 그대로 저장. 숫자 ID 도 find 의 == 비교에서 타입 변환됨.
          state.activeQuestId = item.dataset.questId;
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
