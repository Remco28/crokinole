import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const release = '425b35eb3a73663e55c1210deda8e0d821c0f827';
const baseline = (path: string) => execFileSync('git', ['show', `${release}:${path}`], { encoding: 'utf8' });
const source = (path: string) => readFileSync(path, 'utf8');
function declaration(text: string, name: string) {
  const file = ts.createSourceFile('scene.ts', text, ts.ScriptTarget.ES2020, true);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); if (!result) throw new Error(`Missing function ${name}`); return result;
}
describe('disc designs preserve the accepted preview-8 game', () => {
  it('keeps every physics, rule, input, audio, board artwork and camera-orbit module byte-exact', () => {
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', release, 'src'], { encoding: 'utf8' }).trim().split('\n')
      .filter(p => !['src/main.ts', 'src/style.css', 'src/render/scene.ts', 'src/game/flick.ts'].includes(p));
    expect(paths.length).toBe(15);
    for (const path of paths) expect(source(path), path).toBe(baseline(path));
  });
  it('changes flick input only by the optional zoom speed scale', () => {
    const current = source('src/game/flick.ts')
      .replace(/\/\/ speedScale converts.*\n\/\/ same screen gesture.*\n/, '')
      .replace(/, speedScale(?:: number| = 1)?/g, '').replace(/ \* speedScale/g, '');
    expect(current).toBe(baseline('src/game/flick.ts'));
  });
  it('adds only disc settings and mobile shot zoom to main; gameplay handlers/clock/storage remain exact', () => {
    const current = source('src/main.ts')
      .replace("import { setupDiscSettings } from './disc-settings';\n", '')
      .replace('setupDiscSettings(scene);\n', '')
      .replace('createScene, SHOT_VIEW, type BoardView', 'createScene, type BoardView')
      .replace(/const DEFAULT_ZOOM = 1\.2;\n/, '').replace('zoom = DEFAULT_ZOOM,', 'zoom = 1.2,')
      .replace('Math.min(SHOT_VIEW.maxZoom, value)', 'Math.min(2.5, value)')
      .replace(/\/\/ Flicks are measured[\s\S]*?\n};\n/, '')
      .replace(/, flickSpeedScale\((?:inward\(staged\)|flickContact\.finishDirection \?\? flickContact\.direction)\)\)/g, ')')
      .replace("  scene.setShotDisc(phase === 'pass' ? staged : null);\n", '');
    expect(current).toBe(baseline('src/main.ts'));
  });
  it('preserves the physical geometry reference, picking and resize functions', () => {
    for (const name of ['makeDiscGeometry', 'boardPoint', 'resize'])
      expect(declaration(source('src/render/scene.ts'), name), name).toBe(declaration(baseline('src/render/scene.ts'), name));
  });
  it('removes the old inlay mesh and appends CSS without changing board/controls styles', () => {
    expect(/inlayGeo|inlayMaterial|mesh\.add\(inlay\)/.test(source('src/render/scene.ts'))).toBe(false);
    expect(source('src/style.css').startsWith(baseline('src/style.css'))).toBe(true);
  });
});
