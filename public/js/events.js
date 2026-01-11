function setupEventListeners() {
  // Search
  document.getElementById('sportSearch').addEventListener('input', (e) => {
    filterSports(e.target.value);
  });

  // Header buttons
  document.getElementById('refreshHierarchy').addEventListener('click', () => loadHierarchy(true));
  document.getElementById('bulkScrape').addEventListener('click', bulkScrape);
  document.getElementById('showHealth').addEventListener('click', showHealthModal);

  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', () => {
      toggleMobileSidebar();
    });
  }

  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', () => {
      closeMobileSidebar();
      if (typeof stopLiveTracker === 'function') stopLiveTracker();
      if (typeof stopLiveGameStream === 'function') stopLiveGameStream();
      closeMobileDetails();
      mobileOverlay.classList.add('hidden');
    });
  }

  window.addEventListener('resize', () => {
    if (!isMobileLayout()) {
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (gameDetailsPanel) gameDetailsPanel.classList.remove('mobile-open');
      if (mobileOverlay) mobileOverlay.classList.add('hidden');
    } else {
      hideMobileOverlayIfIdle();
    }
  });

  // Details panel
  document.getElementById('closeDetails').addEventListener('click', () => {
    if (typeof stopLiveTracker === 'function') stopLiveTracker();
    if (typeof stopLiveGameStream === 'function') stopLiveGameStream();
    closeMobileDetails();
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadHierarchy();
  loadHealth();
  setupEventListeners();
  
  // Start counts stream for real-time live/prematch counts
  if (typeof startCountsStream === 'function') {
    startCountsStream();
  }

  // Keep-alive: refresh health every 10 minutes
  setInterval(() => {
    loadHealth();
    console.log('Keep-alive health check');
  }, 10 * 60 * 1000);
});

// Close modal on outside click
healthModal.addEventListener('click', (e) => {
  if (e.target === healthModal) closeHealthModal();
});
