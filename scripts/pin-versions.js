const fs = require('fs');

const pins = {
  typescript: '6.0.3',
};

const apiPins = {
  '@nestjs/cli': '11.0.10',
  '@nestjs/schematics': '11.0.7',
  '@nestjs/common': '11.1.6',
  '@nestjs/core': '11.1.6',
  '@nestjs/config': '4.0.2',
  '@nestjs/platform-express': '11.1.6',
  '@nestjs/platform-socket.io': '11.1.6',
  '@nestjs/websockets': '11.1.6',
  '@nestjs/typeorm': '11.0.0',
  ioredis: '5.7.0',
  typescript: '6.0.3',
};

const webPins = {
  next: '15.5.3',
  typescript: '6.0.3',
};

function patch(file, map, section = 'devDependencies') {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(map)) {
    if (j.dependencies?.[k] !== undefined) j.dependencies[k] = v;
    if (j.devDependencies?.[k] !== undefined) j.devDependencies[k] = v;
    if (section === 'force-dev' && !j.dependencies?.[k]) {
      j.devDependencies = j.devDependencies || {};
      j.devDependencies[k] = v;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
}

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
root.packageManager = 'yarn@4.18.1';
root.volta = { node: '26.13.0', yarn: '4.18.1' };
root.devDependencies.typescript = '6.0.3';
root.resolutions = {
  typescript: '6.0.3',
  '@nestjs/cli': '11.0.10',
  next: '15.5.3',
  ioredis: '5.7.0',
};
fs.writeFileSync('package.json', `${JSON.stringify(root, null, 2)}\n`);

patch('apps/api/package.json', apiPins);
patch('apps/web/package.json', webPins);
patch('apps/game-client/package.json', pins);
patch('packages/shared/package.json', pins);
patch('packages/game-engine/package.json', pins);

console.log('pinned');
