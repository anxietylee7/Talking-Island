function buildDrawSequence() {
  // STORY_NPCS 5명의 순서를 섞기만 함 (누가 먼저 뽑힐지는 랜덤)
  return [...STORY_NPCS].sort(() => Math.random() - 0.5);
}

window.__introRollGacha = async function() {
  console.log('[intro] gacha clicked, index:', introDrawIndex);
  const btn = document.getElementById('intro-gacha-btn');
  const loading = document.getElementById('intro-loading');
  const capsule = document.getElementById('gacha-capsule');
  const result = document.getElementById('gacha-result');
  const actions = document.getElementById('gacha-result-actions');
  
  if (!introDrawSequence) {
    // 첫 가챠 시작 시 상태 완전 리셋
    state.npcs = [];
    introDrawIndex = 0;
    introDrawSequence = buildDrawSequence();
    console.log('[intro] sequence built:', introDrawSequence.map(n => n.name).join(','));
  }
  
  btn.disabled = true;
  btn.style.display = 'none';
  loading.classList.add('show');
  loading.style.display = 'flex';
  capsule.classList.remove('popped');
  capsule.classList.add('rolling');
  capsule.textContent = '🎁';
  capsule.querySelectorAll('.gacha-sparkle').forEach(s => s.remove());
  result.classList.remove('show');
  result.style.display = 'none';
  
  try {
    // 연출용 딜레이 (0.9~1.3초 랜덤)
    const delay = 900 + Math.random() * 400;
    await new Promise(r => setTimeout(r, delay));
    
    const npcTemplate = introDrawSequence[introDrawIndex];
    const newNpc = { 
      ...npcTemplate, 
      location: npcTemplate.homeLocation || 'outside',
    };
    state.npcs.push(newNpc);
    introDrawIndex++;
    
    console.log('[intro] drew:', newNpc.name);
    
    // 진행도 업데이트
    document.getElementById('gacha-count').textContent = introDrawIndex;
    
    // UI 갱신 — 캡슐에 natural 이미지 표시 (없으면 이모지 폴백)
    capsule.classList.remove('rolling');
    capsule.classList.add('popped');
    const naturalKey = `${newNpc.id}_natural`;
    const naturalImg = (window.PRELOADED_ASSETS || {})[naturalKey];
    if (naturalImg) {
      capsule.innerHTML = `<img src="${naturalImg}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="${newNpc.name}" />`;
    } else {
      capsule.textContent = newNpc.emoji;
    }
    loading.classList.remove('show');
    loading.style.display = 'none';
    
    // 반짝이
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'gacha-sparkle';
      s.textContent = ['✨','⭐','💫','🌟'][i % 4];
      const angle = (i / 8) * Math.PI * 2;
      s.style.setProperty('--dx', Math.cos(angle) * 80 + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * 80 + 'px');
      s.style.animationDelay = (i * 0.05) + 's';
      capsule.appendChild(s);
    }
    
    // 결과 카드 채우기 (species 표시 제거 — 이제 종족 개념 없음)
    document.getElementById('result-name').textContent = newNpc.name;
    document.getElementById('result-species').textContent = newNpc.trait;
    document.getElementById('result-job').textContent = newNpc.job;
    document.getElementById('result-dream').textContent = newNpc.dream || '—';
    document.getElementById('result-personality').textContent = newNpc.personality;
    document.getElementById('result-speech').textContent = `"${newNpc.speechHabit}"`;
    
    // 액션 버튼
    if (introDrawIndex < 5) {
      actions.innerHTML = `<button class="story-modal-close" style="margin-top:0" onclick="window.__introRollGacha()">🎲 다음 주민 뽑기 (${introDrawIndex}/5)</button>`;
    } else {
      actions.innerHTML = `<button class="story-modal-close" style="margin-top:0; background: linear-gradient(135deg, #7c94c7 0%, #9d7cc7 100%)" onclick="window.__enterVillage()">🌿 마을로 입장하기</button>`;
    }
    
    setTimeout(() => {
      result.classList.add('show');
      result.style.display = 'block';
    }, 400);
  } catch (err) {
    console.error('[intro] fatal error:', err);
    loading.classList.remove('show');
    loading.style.display = 'none';
    capsule.classList.remove('rolling');
    btn.disabled = false;
    btn.style.display = 'inline-block';
    btn.textContent = '🎲 다시 시도';
    showNotification('❌ 오류: ' + (err.message || '알 수 없는 오류'));
  }
};

window.__enterVillage = async function() {
  console.log('[intro] enter village clicked, npc count:', state.npcs.length);
  
  // 🔧 먼저 GLB 모델 프리로드 (로딩 UI 표시)
  const actions = document.getElementById('gacha-result-actions');
  const loading = document.getElementById('intro-loading');
  if (actions) actions.innerHTML = '';  // "마을로 입장하기" 버튼 숨김
  if (loading) {
    loading.classList.add('show');
    loading.style.display = 'flex';
    const loadingText = loading.querySelector('span');
    if (loadingText) loadingText.textContent = '캐릭터 모델을 불러오는 중... (0/6)';
  }
  
  try {
    if (window.__preloadAllGltfModels) {
      await window.__preloadAllGltfModels((loaded, total, name) => {
        if (loading) {
          const loadingText = loading.querySelector('span');
          if (loadingText) loadingText.textContent = `캐릭터 모델을 불러오는 중... (${loaded}/${total})`;
        }
      });
    }
  } catch (err) {
    console.error('[intro] preload error:', err);
    // 프리로드 실패해도 진행 (프리미티브로 폴백)
  }
  
  if (loading) {
    loading.classList.remove('show');
    loading.style.display = 'none';
  }
  
  // 🔧 이제 인트로 페이드 아웃 + 마을 진입
  const intro = document.getElementById('intro-screen');
  intro.classList.add('fade-out');
  setTimeout(() => {
    intro.style.display = 'none';
    
    // state.npcs에는 이미 인트로에서 뽑은 시나리오 NPC 5명이 있음
    // 중복 스폰 방지 (혹시 이미 메시가 있으면 스킵)
    state.npcs.forEach(npc => {
      if (!npcMeshes[npc.id]) spawnNpcMesh(npc);
    });
    // 유저 아바타 스폰 (광장 중앙)
    spawnUserMesh();
    
    renderNpcList();
    renderCounts();
    
    // 마을 진입 후 환영 메시지 (페이드 아웃 끝난 뒤 여유 있게 1.2초)
    setTimeout(() => {
      showStoryModal(
        '🏘️ 동네에 오신 걸 환영해요',
        '5명의 주민이 이미 이곳에 살고 있어요.\n\n🧑 광장 중앙에 있는 게 당신이에요.\n• 바닥을 클릭하면 그쪽으로 이동합니다.\n• 주민을 클릭하면 가까이 다가가서 대화해요.\n• 집(북쪽)의 침대를 클릭하면 잠들 수 있어요.\n\n편하게 인사하며 동네를 둘러보세요.'
      );
    }, 1200);
  }, 800);
};

// 버튼 이벤트 등록 (안전하게)
function attach(id, event, fn) {
  const el = document.getElementById(id);
  if (!el) { console.warn('Element not found:', id); return; }
  el.addEventListener(event, fn);
}
attach('night-btn', 'click', advanceToNightAndMorning);
attach('exit-interior', 'click', exitInterior);

// 초기 렌더링
renderNpcList();
renderTabs();
renderContent();
renderCounts();
if (typeof renderQuestBanner === 'function') renderQuestBanner(); // [9단계]

// =========================================================
// 애니메이션 루프
// =========================================================
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  
  // updateNpcs는 씬 모드와 무관하게 npcMeshes 전체를 관리
  // (각 NPC의 currentScene 속성에 따라 이동 방식이 달라짐)
  updateNpcs(dt);
  
  if (state.viewMode === 'interior') {
    updateInteriorLighting();
    // 유저는 내부에서도 움직일 수 있음
    if (state.user.mesh) state.user.mesh.visible = true;
    updateUser(dt);
    updateDestinationMarker(dt);
    // 유저 이름 말풍선은 내부에서 숨김 (답답함 방지)
    if (state.user.bubbleEl) state.user.bubbleEl.classList.add('hide');
    renderer.render(interiorScene, camera);
  } else {
    // 시뮬레이션 중에는 유저 아바타 숨김 + 시간은 runSimulationTick이 관리
    if (state.simulation.active) {
      if (state.user.mesh) state.user.mesh.visible = false;
      if (state.user.bubbleEl) state.user.bubbleEl.classList.add('hide');
      runSimulationTick(dt);
      // 조명만 갱신 (시간 흐름에 따른 하늘/조명)
      updateSimulationLighting();
    } else {
      if (state.user.mesh) state.user.mesh.visible = true;
      updateUser(dt);
      updateDestinationMarker(dt);
      updateTimeOfDay(dt);
    }
    renderer.render(scene, camera);
  }
}
animate();
