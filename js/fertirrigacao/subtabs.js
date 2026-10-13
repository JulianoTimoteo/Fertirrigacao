// ============================================================================
// ferti_subtabs.js — Navegação das Sub-abas de Fertirrigação + Autoplay
// ============================================================================

let _autoplayInterval = null;

export function setupFertirrigacaoSubTabs() {
  const container = document.getElementById('fertirrigacao-sub-tabs');
  const playBtn   = document.getElementById('play-pause-btn');
  if (!container) return;

  // Garante que a primeira aba já está ativa
  const primeira = container.querySelector('.fert-sub-tab');
  if (primeira && !primeira.classList.contains('active')) {
    primeira.classList.add('active');
    const target = document.getElementById(primeira.dataset.tab);
    if (target) target.classList.add('active');
  }

  // Delegação de clique nas sub-abas
  container.addEventListener('click', e => {
    const btn = e.target.closest('.fert-sub-tab');
    if (!btn) return;

    // Para o autoplay ao clicar manualmente
    _stopAutoplay(playBtn);

    _ativarAba(container, btn.dataset.tab);
  });

  // Botão Autoplay
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (_autoplayInterval) {
        _stopAutoplay(playBtn);
      } else {
        _avancarAba(container);   // avança imediatamente
        _autoplayInterval = setInterval(() => _avancarAba(container), 20000);
        playBtn.innerHTML = `<span class="material-symbols-outlined">pause</span> Pausar`;
        playBtn.classList.replace('bg-red-500', 'bg-green-500');
        playBtn.classList.replace('hover:bg-red-600', 'hover:bg-green-600');
      }
    });
  }
}

function _ativarAba(container, tabId) {
  container.querySelectorAll('.fert-sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.fert-sub-content').forEach(c => c.classList.remove('active'));

  const btn     = container.querySelector(`[data-tab="${tabId}"]`);
  const content = document.getElementById(tabId);
  if (btn)     btn.classList.add('active');
  if (content) content.classList.add('active');

  if (tabId === 'grafico-content') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ferti:renderCharts'));
    }, 60);
  } else if (tabId === 'mapa-content') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ferti:renderMap'));
    }, 60);
  }
}

function _avancarAba(container) {
  const tabs  = Array.from(container.querySelectorAll('.fert-sub-tab'));
  const cur   = tabs.findIndex(t => t.classList.contains('active'));
  const next  = tabs[(cur + 1) % tabs.length];
  _ativarAba(container, next.dataset.tab);
}

function _stopAutoplay(playBtn) {
  if (_autoplayInterval) { clearInterval(_autoplayInterval); _autoplayInterval = null; }
  if (playBtn) {
    playBtn.innerHTML = `<span class="material-symbols-outlined">play_arrow</span> Autoplay`;
    playBtn.classList.replace('bg-green-500', 'bg-red-500');
    playBtn.classList.replace('hover:bg-green-600', 'hover:bg-red-600');
  }
}

export function stopAutoplay() {
  _stopAutoplay(document.getElementById('play-pause-btn'));
}
