const fs = require('fs');

const lockPath = 'yarn.lock';
let lock = fs.readFileSync(lockPath, 'utf8');
const before = lock.includes('compat/typescript');

lock = lock.replace(
  /"typescript@patch:typescript@npm%3A[^"]+#optional!builtin<compat\/typescript>"/g,
  '"typescript@npm:6.0.3"',
);
lock = lock.replace(
  /typescript@patch:typescript@npm%3A[^:#\n"]+#optional!builtin<compat\/typescript>/g,
  'typescript@npm:6.0.3',
);
lock = lock.replace(
  /resolution: "typescript@patch:typescript@npm%3A5\.9\.3#optional!builtin<compat\/typescript>::version=5\.9\.3&hash=[^"]+"/g,
  'resolution: "typescript@npm:6.0.3"',
);

fs.writeFileSync(lockPath, lock);
console.log(
  JSON.stringify({
    before,
    after: fs.readFileSync(lockPath, 'utf8').includes('compat/typescript'),
  }),
);
