document.addEventListener('DOMContentLoaded', function() {
  const user = requireLogin();

  if (!user) return;

  document.getElementById('homeContent').innerHTML = `
    <div class="menu-area">
      <a class="menu-btn" href="annual.html">${escapeHtml(user.temple)} 今年道務</a>
      <a class="menu-btn" href="history.html">各壇近年道務</a>
    </div>
  `;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});