// 스크린샷 도구 예제: 고정 획을 그리고 __ready를 켠다.
const canvas = document.querySelector<HTMLCanvasElement>('#board');
const ctx = canvas?.getContext('2d');
if (ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#111';
  ctx.strokeRect(100, 100, 400, 200);
  ctx.beginPath();
  ctx.moveTo(600, 200);
  ctx.lineTo(900, 200);
  ctx.lineTo(860, 180);
  ctx.moveTo(900, 200);
  ctx.lineTo(860, 220);
  ctx.stroke();
}
window.__ready = true;
