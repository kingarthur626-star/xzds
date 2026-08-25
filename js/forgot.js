document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('forgotForm');

  if (!form) return;

  form.addEventListener('submit', handleResetPassword);

  const params = new URLSearchParams(location.search);
  if (params.get('force') === '1') {
    const accountInput = document.getElementById('forgotAccount');
    const forcedAccount = sessionStorage.getItem('forcedPasswordResetAccount') || '';
    if (accountInput && forcedAccount) {
      accountInput.value = forcedAccount;
      accountInput.readOnly = true;
    }
    showMessage('forgotMessage', 'warning', '請先完成密碼變更，完成後才能登入系統。');
  }

  document.querySelectorAll('input[name="forgotGroup"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      const group = getSelectedRadioValue('forgotGroup');
      loadTemplesByGroup(group, 'forgotTempleSelect', 'forgotMessage');
    });
  });
});

async function handleResetPassword(e) {
  e.preventDefault();

  clearMessage('forgotMessage');

  const btn = document.getElementById('forgotBtn');

  const group = getSelectedRadioValue('forgotGroup');
  const temple = document.getElementById('forgotTempleSelect').value.trim();
  const name = document.getElementById('forgotName').value.trim();
  const account = document.getElementById('forgotAccount').value.trim();
  const newPassword = document.getElementById('forgotNewPassword').value.trim();

  if (!group) {
    showMessage('forgotMessage', 'error', '請選擇組別');
    return;
  }

  if (!temple) {
    showMessage('forgotMessage', 'error', '請選擇壇名');
    return;
  }

  if (!name) {
    showMessage('forgotMessage', 'error', '請輸入姓名');
    return;
  }

  if (!account) {
    showMessage('forgotMessage', 'error', '請輸入註冊的 Gmail');
    return;
  }

  if (!newPassword) {
    showMessage('forgotMessage', 'error', '請輸入新密碼');
    return;
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
    showMessage('forgotMessage', 'error', '新密碼需包含英文大寫、小寫與數字，且至少8碼');
    return;
  }

  btn.disabled = true;
  btn.textContent = '修改中...';

  try {
    const result = await callApi({
      action: 'resetPassword',
      group: group,
      temple: temple,
      name: name,
      account: account,
      newPassword: newPassword
    });

    if (result.success) {
      sessionStorage.removeItem('forcedPasswordResetAccount');
      alert(result.message || '密碼變更成功，請登入');
      location.href = 'index.html?reset=success';
    } else {
      showMessage('forgotMessage', 'error', result.message || '密碼變更失敗');
    }

  } catch (err) {
    showMessage('forgotMessage', 'error', err.message || '系統連線失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '確認身份並修改密碼';
  }
}
