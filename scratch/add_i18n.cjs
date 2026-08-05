const fs = require('fs');
const path = require('path');

function replaceAll(str, replacements) {
  let out = str;
  for (const [search, replace] of replacements) {
    out = out.split(search).join(replace);
  }
  return out;
}

const rolesPath = path.join(__dirname, '../public/modules/roles.html');
let rolesContent = fs.readFileSync(rolesPath, 'utf8');

rolesContent = replaceAll(rolesContent, [
  ['<title>РОЛИ</title>', '<script src="../js/i18n.js"></script>\n<title>РОЛИ</title>'],
  ['<h1>🔐 Управление ролями</h1>', '<h1>🔐 <span data-i18n="Управление ролями">Управление ролями</span></h1>'],
  ['<button onclick="parent.postMessage({type:\'SEG_CLOSE_MODULE\'}, \'*\')">← Назад</button>', '<button onclick="parent.postMessage({type:\'SEG_CLOSE_MODULE\'}, \'*\')"><span data-i18n="← Назад">← Назад</span></button>'],
  ['<button onclick="openModal()" style="margin-left: 10px;">+ Создать роль</button>', '<button onclick="openModal()" style="margin-left: 10px;"><span data-i18n="+ Создать роль">+ Создать роль</span></button>'],
  ['<th>Название</th>', '<th data-i18n="Название">Название</th>'],
  ['<th>Дата создания</th>', '<th data-i18n="Дата создания">Дата создания</th>'],
  ['<th>Действия</th>', '<th data-i18n="Действия">Действия</th>'],
  ['<td colspan="3">Загрузка...</td>', '<td colspan="3" data-i18n="Загрузка...">Загрузка...</td>'],
  ['<h3 id="modalTitle">Создать роль</h3>', '<h3 id="modalTitle" data-i18n="Создать роль">Создать роль</h3>'],
  ['<label>Название роли</label>', '<label data-i18n="Название роли">Название роли</label>'],
  ['<label>Права доступа</label>', '<label data-i18n="Права доступа">Права доступа</label>'],
  [' Полный доступ (Super Admin)</label>', ' <span data-i18n="Полный доступ (Super Admin)">Полный доступ (Super Admin)</span></label>'],
  ['<button onclick="closeModal()">Отмена</button>', '<button onclick="closeModal()" data-i18n="Отмена">Отмена</button>'],
  ['<button onclick="saveRole()" style="background: rgba(34,211,238,0.2);">Сохранить</button>', '<button onclick="saveRole()" style="background: rgba(34,211,238,0.2);" data-i18n="Сохранить">Сохранить</button>'],
  ['<button onclick="editRole(\'${role.id}\', \'${role.name}\', \'${encodeURIComponent(JSON.stringify(role.permissions))}\')">Изменить</button>', '<button onclick="editRole(\'${role.id}\', \'${role.name}\', \'${encodeURIComponent(JSON.stringify(role.permissions))}\')" data-i18n="Изменить">Изменить</button>'],
  ['<button onclick="deleteRole(\'${role.id}\')" style="color:#ff6b6b; border-color:#ff6b6b;">Удалить</button>', '<button onclick="deleteRole(\'${role.id}\')" style="color:#ff6b6b; border-color:#ff6b6b;" data-i18n="Удалить">Удалить</button>'],
  ['${p.desc}', '<span data-i18n="${p.desc}">${p.desc}</span>'],
  ['document.getElementById(\'modalTitle\').innerText = \'Создать роль\';', 'document.getElementById(\'modalTitle\').setAttribute(\'data-i18n\', \'Создать роль\');\n  document.getElementById(\'modalTitle\').innerText = \'Создать роль\';\n  setTimeout(() => window.applyTranslations?.(), 0);'],
  ['document.getElementById(\'modalTitle\').innerText = \'Редактировать роль\';', 'document.getElementById(\'modalTitle\').setAttribute(\'data-i18n\', \'Редактировать роль\');\n  document.getElementById(\'modalTitle\').innerText = \'Редактировать роль\';\n  setTimeout(() => window.applyTranslations?.(), 0);'],
]);

// Add applyTranslations for dynamic renders
rolesContent = rolesContent.replace(
  'tbody.appendChild(tr);\n    });\n  } catch (err)',
  'tbody.appendChild(tr);\n    });\n    setTimeout(() => window.applyTranslations?.(), 0);\n  } catch (err)'
);
rolesContent = rolesContent.replace(
  '`).join(\'\');\n}',
  '`).join(\'\');\n  setTimeout(() => window.applyTranslations?.(), 0);\n}'
);

fs.writeFileSync(rolesPath, rolesContent);

const usersPath = path.join(__dirname, '../public/modules/users.html');
let usersContent = fs.readFileSync(usersPath, 'utf8');

usersContent = replaceAll(usersContent, [
  ['<title>ПОЛЬЗОВАТЕЛИ</title>', '<script src="../js/i18n.js"></script>\n<title>ПОЛЬЗОВАТЕЛИ</title>'],
  ['<h1>👥 Управление пользователями</h1>', '<h1>👥 <span data-i18n="Управление пользователями">Управление пользователями</span></h1>'],
  ['<button onclick="parent.postMessage({type:\'SEG_CLOSE_MODULE\'}, \'*\')">← Назад</button>', '<button onclick="parent.postMessage({type:\'SEG_CLOSE_MODULE\'}, \'*\')"><span data-i18n="← Назад">← Назад</span></button>'],
  ['<button onclick="openModal()" style="margin-left: 10px;">+ Добавить пользователя</button>', '<button onclick="openModal()" style="margin-left: 10px;"><span data-i18n="+ Добавить пользователя">+ Добавить пользователя</span></button>'],
  ['<th>Имя</th>', '<th data-i18n="Имя">Имя</th>'],
  ['<th>Email</th>', '<th data-i18n="Email">Email</th>'],
  ['<th>Роль</th>', '<th data-i18n="Роль">Роль</th>'],
  ['<th>Статус</th>', '<th data-i18n="Статус">Статус</th>'],
  ['<th>Действия</th>', '<th data-i18n="Действия">Действия</th>'],
  ['<td colspan="5">Загрузка...</td>', '<td colspan="5" data-i18n="Загрузка...">Загрузка...</td>'],
  ['<h3 id="modalTitle">Добавить пользователя</h3>', '<h3 id="modalTitle" data-i18n="Добавить пользователя">Добавить пользователя</h3>'],
  ['<label>ФИО</label>', '<label data-i18n="ФИО">ФИО</label>'],
  ['<label>Email</label>', '<label data-i18n="Email">Email</label>'],
  ['<label>Системная Роль</label>', '<label data-i18n="Системная Роль">Системная Роль</label>'],
  ['<label>Статус</label>', '<label data-i18n="Статус">Статус</label>'],
  ['<option value="active">Активен</option>', '<option value="active" data-i18n="Активен">Активен</option>'],
  ['<option value="suspended">Заблокирован</option>', '<option value="suspended" data-i18n="Заблокирован">Заблокирован</option>'],
  ['<label>Пароль <span id="pwdHint"', '<label><span data-i18n="Пароль">Пароль</span> <span id="pwdHint"'],
  ['<button onclick="closeModal()">Отмена</button>', '<button onclick="closeModal()" data-i18n="Отмена">Отмена</button>'],
  ['<button onclick="saveUser()" style="background: rgba(34,211,238,0.2);">Сохранить</button>', '<button onclick="saveUser()" style="background: rgba(34,211,238,0.2);" data-i18n="Сохранить">Сохранить</button>'],
  ['<td>${user.status === \'active\' ? \'Активен\' : \'<span style="color:#ff6b6b">Заблокирован</span>\'}</td>', '<td>${user.status === \'active\' ? \'<span data-i18n="Активен">Активен</span>\' : \'<span style="color:#ff6b6b" data-i18n="Заблокирован">Заблокирован</span>\'}</td>'],
  ['<button onclick="editUser(\'${user.id}\', \'${encodeURIComponent(user.fullName)}\', \'${user.systemRoleId}\', \'${user.status}\')">Редактировать</button>', '<button onclick="editUser(\'${user.id}\', \'${encodeURIComponent(user.fullName)}\', \'${user.systemRoleId}\', \'${user.status}\')" data-i18n="Редактировать">Редактировать</button>'],
  ['document.getElementById(\'modalTitle\').innerText = \'Добавить пользователя\';', 'document.getElementById(\'modalTitle\').setAttribute(\'data-i18n\', \'Добавить пользователя\');\n  document.getElementById(\'modalTitle\').innerText = \'Добавить пользователя\';\n  setTimeout(() => window.applyTranslations?.(), 0);'],
  ['document.getElementById(\'modalTitle\').innerText = \'Редактировать пользователя\';', 'document.getElementById(\'modalTitle\').setAttribute(\'data-i18n\', \'Редактировать пользователя\');\n  document.getElementById(\'modalTitle\').innerText = \'Редактировать пользователя\';\n  setTimeout(() => window.applyTranslations?.(), 0);'],
]);

usersContent = usersContent.replace(
  'tbody.appendChild(tr);\n    });\n  } catch (err)',
  'tbody.appendChild(tr);\n    });\n    setTimeout(() => window.applyTranslations?.(), 0);\n  } catch (err)'
);

fs.writeFileSync(usersPath, usersContent);

console.log("Updated HTML files.");
