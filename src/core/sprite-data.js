// 像素點陣（純資料）。'.' = 透明；其餘字元對應 pal。renderer 自行轉成圖。
export const SPRITES = {
  player: {
    pal: { h: '#15506a', c: '#3ad6ff', d: '#2a7fff', s: '#ffd9b0', e: '#0b1a2a', b: '#ffcf5a', l: '#1d2f48' },
    frames: {
      stand: [
        '...hhhh...', '..hcccch..', '.hcccccch.', '.hcssssc..', '.hcsesse..', '.hcssssc..',
        '..dccccd..', '.cdcbbcdc.', '.ccdccdcc.', '..cccccc..', '..dd..dd..', '..ll..ll..',
        '..ll..ll..', '.lll..lll.'],
      run1: [
        '...hhhh...', '..hcccch..', '.hcccccch.', '.hcssssc..', '.hcsesse..', '.hcssssc..',
        '..dccccd..', '.cdcbbcdc.', 'cccdccdcc.', '..cccccc..', '..dd...dd.', '.ll....ll.',
        'll......l.', 'l.......ll'],
      run2: [
        '...hhhh...', '..hcccch..', '.hcccccch.', '.hcssssc..', '.hcsesse..', '.hcssssc..',
        '..dccccd..', '.cdcbbcdc.', '.ccdccdccc', '..cccccc..', '...dddd...', '...llll...',
        '...ll.l...', '..lll.ll..'],
      jump: [
        '...hhhh...', '..hcccch..', '.hcccccch.', '.hcssssc..', '.hcsesse..', '.hcssssc..',
        'c.dccccd.c', 'ccdcbbcdcc', '..cdccdc..', '..cccccc..', '.dd....dd.', '.ll....ll.',
        'll......ll', '..........'],
      swim: [
        '..........', '...hhhh...', '..hcccch..', '.hcccccch.', '.hcssssc.c', '.hcsesse.c',
        '.hcssssccc', 'ccdccccd..', 'c.dcbbcd..', '..cdccdc..', '..cccccc..', '...dd.dd..',
        '..ll...ll.', '.ll.....ll'],
    },
  },
  crab: {
    pal: { r: '#ff6a4a', d: '#b8352a', e: '#111111', w: '#ffffff' },
    frames: {
      a: ['r..........r', 'rr........rr', '.rr.we.we.rr', '..rrrrrrrr..', '.rrrrrrrrrr.', 'rrddrrrrddrr', '.d.d....d.d.', 'd..d....d..d'],
      b: ['.r........r.', 'rr........rr', '.rr.we.we.rr', '..rrrrrrrr..', '.rrrrrrrrrr.', 'rrddrrrrddrr', '..d.d..d.d..', '.d..d..d..d.'],
    },
  },
  jelly: {
    pal: { p: '#ff8ad8', P: '#c25ab0', w: '#ffffff', t: '#ffb8ec' },
    frames: {
      a: ['...pppp...', '.pppppppp.', 'pppwppwppp', 'pppppppppp', 'pPPPPPPPPp', '.t.t..t.t.', '.t..t.t..t', 't..t..t.t.', '.t..t...t.', '...t...t..'],
      b: ['..........', '...pppp...', '.pppppppp.', 'pppwppwppp', 'pPPPPPPPPp', '.t.t..t.t.', 't..t.t..t.', '.t..t..t..', '..t..t.t..', '.t.......t'],
    },
  },
  puffer: {
    pal: { y: '#ffd84a', o: '#e09a1a', e: '#111111', s: '#fff3b0' },
    frames: {
      a: ['..s.ss.s..', '.yyyyyyyy.', 'yyyyyyeyyy', 'yyyyyyyyyo', 'yysssssyyo', '.ysssssyy.', '..oo..oo..', '..........'],
      b: ['..........', '..s.ss.s..', '.yyyyyyyy.', 'yyyyyyeyyo', 'yyyyyyyyyo', 'yysssssyy.', '.oo....oo.', '..........'],
    },
  },
  urchin: {
    pal: { k: '#2b1640', u: '#5a2a7a', s: '#c58cff' },
    frames: { a: ['....s..s....', '.s..k..k..s.', '..k.uuuu.k..', 's.kuuuuuuk.s', '..uusuusuu..', 'kkuuuuuuuukk', '..uuuuuuuu..', 's.kuuuuuuk.s'] },
  },
  pearl: {
    pal: { w: '#ffffff', p: '#bff4ff', b: '#3ad6ff' },
    frames: { a: ['.pppp.', 'pwwppp', 'pwpppb', 'ppppbb', 'pppbbb', '.bbbb.'] },
  },
  heart: {
    pal: { r: '#ff4d6d', w: '#ffd0d8', d: '#a8203c' },
    frames: { a: ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrd.', '..rrd..', '...d...'] },
  },
  eelHead: {
    pal: { g: '#2fae9a', d: '#16645c', y: '#fff36a', w: '#e8fffb', r: '#ff3d6e' },
    frames: {
      a: [
        '......gggggggg....', '....gggggggggggg..', '..ggggdgggggggyyg.', '.gggggdggggggyryg.',
        'ggggggdgggggggyyg.', 'gggggddggggggggggg', 'ggggddggggwgwgwgwg', 'gggddgggg.........',
        'gggdgggggwgwgwgwgg', '.gggggggggggggggg.', '..gggggggggggggg..', '....gggggggggg....'],
    },
  },
};
