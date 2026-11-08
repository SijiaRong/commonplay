export const stageNames = ['玩具门廊','蜡笔峡谷','枕头山口','地毯回旋','玩具箱决赛'];
export const pieceNames = {
  runway:'平地助跑',slalomDeck:'积木绕桩',hurdleDeck:'矮栏跑道',firstDoors:'第一道移门',
  hammerDeck:'钟摆锤廊',tileDeck:'波浪地板',finishDoors:'终点门廊',shortSlide:'树脂滑梯',
  curvedSlide:'回旋滑梯',saturnSlide:'土星回旋滑梯',fork:'分岔道',turn:'折返弯',bank:'倾斜弯',helix:'螺旋弯',
  megaJump:'大跳台',whirlpool:'旋涡',drum:'弹跳鼓',plunge:'陡降滑槽',spintop:'陀螺',halfpipe:'半管滑道',
  hoopJump:'穿环跳台',hopscotch:'跳房子',trampolines:'蹦床',bigAir:'腾空跳台',cascade:'阶梯落坡',cliff:'断崖',
  pegs:'绕桩',spinners:'旋转杆',hammers:'摆锤',sweeper:'扫杆',seesaws:'跷跷板',keys:'琴键',
  bumperField:'碰撞柱阵',rollers:'滚筒',gates:'移门',trapFloor:'陷阱地板',hills:'起伏坡',bumps:'颠簸路',funnel:'漏斗'
};
export function courseSeed(params) {
  const seed = params.get('seed');
  return /^\d{1,10}$/.test(seed || '') && Number(seed)<=0xffffffff ? Number(seed) : 20261108;
}
