const fs = require('fs');
const r = './routes/';

function fix(file, replacements) {
  let content = fs.readFileSync(r + file, 'utf8');
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(r + file, content);
  console.log('✅ ' + file + ' fixed');
}

fix('home.js', [
  ['UID: uid })', 'fId: uid })'],
  ['UID: uid, SubUID: subUID || null', 'fUID: uid, Filter: \'\''],
  ['UID: uid, Filter: \'\'', 'fUID: uid, Filter: \'\''],
]);

fix('game.js', [
  ['{ UID: uid }', '{ fId: uid }'],
  ['fUID: uid,', 'fUID: uid,'],
  ['\n      UID: uid,', '\n      fUID: uid,'],
]);

fix('customer.js', [
  ['{ UID: uid, Filter', '{ fUID: uid, Filter'],
  ['{ UID: uid }', '{ fUID: uid, Filter: \'\' }'],
  ['fUID: uid, SubUID: subUID || null', 'fUID: uid, Filter: \'\''],
]);

fix('hisab.js', [
  ['{ UID: uid,', '{ fUID: uid,'],
  ['UID: uid,\n      FromDate', 'fUID: uid,\n      FromDate'],
]);

fix('balance.js', [
  ['{ UID: uid,', '{ fUID: uid,'],
]);

fix('lc.js', [
  ['{ UID: uid,', '{ fUID: uid,'],
]);

fix('received.js', [
  ['{ UID: uid,\n      SubUID: subUID || null\n    }', '{ fSenderID: parseInt(uid), GID: 0, Filter: \'\', ViewAll: false }'],
  ['UID: uid }', 'fSenderID: parseInt(uid), GID: 0, Filter: \'\', ViewAll: false }'],
]);

console.log('\n✅ All fixed! Now restart: node server.js');
