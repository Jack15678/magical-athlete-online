import houseRules from '../../docs/house-rules.md?raw';

// Ship the actual public house rules with the app; players never need repository access.
export function RulesContent({ browser = false }: { browser?: boolean }) {
  const rules = houseRules.split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => line.slice(2));
  return <div className="rules-copy">
    <p>挑选四位不太正经的运动员，参加四场比赛；两人模式每人八位、每场两位。每位运动员都有特殊能力，后面的比赛奖分更多。</p>
    <ol>
      <li><strong>邀请与准备</strong>：创建房间，把网站链接和房间号发给朋友。朋友打开网站，输入昵称和房间号即可入座，全员准备后由房主开局。</li>
      <li><strong>两次蛇形选秀</strong>：轮到你时，从候选角色中选择一位，直到每人四位；两人模式每人八位。每张初始角色独一无二。</li>
      <li><strong>暗选再揭示</strong>：每场选一位未使用的角色，两人各选两位。其他玩家只能看到你是否选好，直到大家一起揭示。</li>
      <li><strong>掷骰与技能</strong>：轮流掷骰，按角色能力响应。有人需要做决定时，比赛会等待对应玩家；点击棋子或“查看能力”读取完整技能。</li>
      <li><strong>赛道与四场积分</strong>：四场依次为温和、狂野、温和、狂野。狂野星格得1分，OUPS格绊倒，箭头格按正负提示移动。各场冠亚军得分为3/1、4/2、5/3、6/4；第二位冲线后立即结束当场。四场总分相同共享胜利。</li>
    </ol>
    {browser && <><h3>浏览器计算房主</h3><p>创建房间的原浏览器负责实时计算并在本地IndexedDB保存完整对局。朋友的页面只收到本人可见内容。请保持负责计算的标签页打开；刷新或短暂断网后用原浏览器返回，已确认操作与待处理选择会恢复。计算房主网页离线时对局暂停，其他页面等待其返回。不要清理原浏览器的站点数据，也不要使用会自动清除数据的隐私窗口。</p><p>“转交房主”只移交开局、下一场和再来一局等游戏管理权限，计算与完整存档仍在最初的计算房主浏览器中。同一身份打开多个标签页时只有一个可以持有计算锁，其余页面作为普通查看与操作页面。</p></>}
    <h3>本房间采用的网页房规</h3>
    <p>以下为项目公开约定，独立于官方规则；每位访客都可在此完整阅读。</p>
    <ul className="house-rules-list">{rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
    <h3>关于规则来源</h3>
    <p>本项目依据 CMYK 2025 基础盒及 IELLO 2026-08-28 v2.0 FAQ 整合的八月修订建模。2026-10-21 从发行商量产实物照片逐格核验狂野赛道。CMYK 最新英文规则与八月帖的 BGG 正文读取受限，现行裁定以发行商 FAQ 交叉核对，未声称逐页阅读了新版英文 PDF。</p>
    <p>这是非官方同好项目，中文角色名为本项目译名。<a href="https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/" target="_blank" rel="noreferrer">发行商现行 FAQ</a>和<a href="https://www.cmyk.games/products/magical-athlete" target="_blank" rel="noreferrer">CMYK 原作</a>可公开查看。</p>
  </div>;
}
