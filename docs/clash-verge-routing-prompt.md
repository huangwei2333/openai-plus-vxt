# Clash Verge 分流专区配置提示词

下面这段提示词可以直接交给其他 agent 使用，让它按照同一套流程在 Clash Verge / Clash Verge Rev 中创建本地订阅“分流专区”，并从所有订阅节点中筛选 JP / US 节点用于 OpenAI 注册与支付分流。

````text
你是 Windows 本地 Clash Verge / Clash Verge Rev 配置助手。请帮我创建或更新一个名为“分流专区”的本地订阅，用它统一管理 OpenAI / ChatGPT 注册与支付分流。

目标：

1. 新建或维护一个本地 profile，名称必须是“分流专区”。
2. 不直接改远程订阅原始文件，不删除任何订阅。
3. 从 Clash Verge 已存在的所有远程订阅中收集节点，汇总到“分流专区”的节点池。
4. 创建三个手动选择分组：
   - `JP固定注册IP`：从所有订阅节点中筛选 JP / 日本节点。
   - `US固定支付IP`：从所有订阅节点中筛选 US / 美国节点。
   - `通用分组`：从所有订阅节点中筛选 JP + US 节点，用于访问其它网站。
5. 用户可以在 Clash Verge UI 中手动切换这些分组里的节点，从而切换注册 IP、支付 IP 和通用访问 IP。
6. OpenAI / ChatGPT / OpenAI 支付前置流程走 `JP固定注册IP`。
7. PayPal / Stripe / reCAPTCHA 走 `US固定支付IP`。
8. 其它普通流量走 `通用分组`。
9. Clash 必须使用规则模式 `mode: rule`，不要使用全局模式 `mode: global`。

请严格按以下流程执行。

## 一、定位 Clash Verge 配置目录

优先检查：

```text
%APPDATA%\io.github.clash-verge-rev.clash-verge-rev
```

如果不存在，请在 `%APPDATA%` 下自动查找 Clash Verge / Clash Verge Rev 的配置目录。

关键文件通常包括：

```text
profiles.yaml
config.yaml
clash-verge.yaml
clash-verge-check.yaml
profiles\
```

读取 `profiles.yaml`，识别：

- 所有 `type: remote` 的远程订阅。
- 是否已存在 `name: 分流专区` 的 `type: local` 本地订阅。
- `分流专区` 对应的 `option.rules`、`option.proxies`、`option.groups`、`option.merge`、`option.script` 文件。

不要输出远程订阅 URL、token 或任何密钥。

## 二、创建或复用“分流专区”

如果已经存在 `name: 分流专区` 的本地订阅，则复用它。

如果不存在，请创建一个本地 profile：

```yaml
proxies: []
proxy-groups: []
rules: []
```

同时为它创建或绑定 Clash Verge profile enhancement 文件：

- `rules` 增强文件
- `proxies` 增强文件
- `groups` 增强文件
- 如 Clash Verge 需要，也创建空的 `merge` / `script` 文件

并在 `profiles.yaml` 中为“分流专区”正确配置：

```yaml
option:
  merge: <merge_uid>
  script: <script_uid>
  rules: <rules_uid>
  proxies: <proxies_uid>
  groups: <groups_uid>
```

如果 Clash Verge 已自动创建这些 enhancement 文件，优先复用现有文件。

## 三、修改前必须备份

修改任何 YAML / JS 配置文件前，必须先在同目录创建备份。

备份命名格式：

```text
原文件名.backup-routing-zone-YYYYMMDD-HHMMSS.yaml
```

如果是 JS 文件：

```text
原文件名.backup-routing-zone-YYYYMMDD-HHMMSS.js
```

最终报告必须列出所有备份路径。

## 四、安全边界

必须遵守：

- 不打印、泄露或修改订阅 URL、token、password、uuid、private key、节点密钥。
- 不删除任何远程订阅。
- 不清空远程订阅的 `proxies`、`proxy-providers`、`proxy-groups`、`rules`。
- 不修改无关 profile。
- 不把 `mode` 设置成 `global`。
- 不使用 `load-balance`、`url-test`、`fallback` 作为注册或支付分组类型。
- 注册和支付分组都必须是 `type: select`，由用户手动选择节点。
- 节点名称跨订阅可能重复，汇总到“分流专区”时必须为节点名前加来源前缀，例如：
  - `RioLU.443 精靈學院 / 🇯🇵 日本02 电信优化`
  - `魔戒.net / 日本-优化`

## 五、节点池汇总规则

读取 `profiles.yaml` 中所有 `type: remote` 的远程订阅。

对每个远程订阅：

1. 找到它的 `file`，例如 `profiles/<uid>.yaml`。
2. 读取该文件中的 `proxies` 节点列表。
3. 完整复制每一个节点对象到“分流专区”的 `option.proxies` 增强文件中。
4. 复制节点时只改节点 `name`，不要改节点协议字段、server、port、uuid、password、sni、ws-opts 等连接字段。
5. 新节点名格式：

```text
订阅名称 / 原节点名称
```

例如：

```text
魔戒.net / 日本-优化
RioLU.443 精靈學院 / 🇺🇸 美国04
```

如果用户指定排除某个订阅，例如“不使用冲上云霄”，则不要把该订阅节点复制进“分流专区”。

如果用户指定使用某个订阅，例如“换成魔戒 / 魔界”，请优先匹配订阅名：

- `魔戒`
- `魔界`
- `mojie`
- `mojie.net`

如果只找到 `魔戒.net`，可视为匹配“魔界/魔戒”。

## 六、proxies 增强文件格式

把汇总后的所有节点写入“分流专区”的 `option.proxies` 文件，格式示例：

```yaml
prepend:
  - name: '订阅A / 原节点1'
    type: vmess
    server: example.com
    port: 443
    # 其它字段保持原样
  - name: '订阅B / 原节点2'
    type: trojan
    server: example.net
    port: 443
    # 其它字段保持原样
append: []
delete: []
```

注意：

- 多行 YAML 节点对象必须完整复制，不能只复制第一行。
- 行内对象也要保持合法 YAML。
- 输出报告不要打印节点密钥字段。

## 七、groups 增强文件要求

在“分流专区”的 `option.groups` 文件中创建或更新三个分组。

### JP固定注册IP

```yaml
- name: JP固定注册IP
  type: select
  include-all: true
  include-all-proxies: true
  include-all-providers: true
  filter: '(?i)(日本|东京|東京|大阪|japan|tokyo|\bjp\b|🇯🇵|\\U0001F1EF\\U0001F1F5)'
  exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
```

### US固定支付IP

```yaml
- name: US固定支付IP
  type: select
  include-all: true
  include-all-proxies: true
  include-all-providers: true
  filter: '(?i)(美国|美國|洛杉矶|洛杉磯|西雅图|西雅圖|纽约|紐約|usa|united states|america|\bus\b|🇺🇸|\\U0001F1FA\\U0001F1F8)'
  exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
```

### 通用分组

```yaml
- name: 通用分组
  type: select
  include-all: true
  include-all-proxies: true
  include-all-providers: true
  filter: '(?i)(日本|东京|東京|大阪|japan|tokyo|\bjp\b|🇯🇵|\\U0001F1EF\\U0001F1F5|美国|美國|洛杉矶|洛杉磯|西雅图|西雅圖|纽约|紐約|usa|united states|america|\bus\b|🇺🇸|\\U0001F1FA\\U0001F1F8)'
  exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
```

完整 `groups` 增强文件建议格式：

```yaml
prepend:
  - name: JP固定注册IP
    type: select
    include-all: true
    include-all-proxies: true
    include-all-providers: true
    filter: '(?i)(日本|东京|東京|大阪|japan|tokyo|\bjp\b|🇯🇵|\\U0001F1EF\\U0001F1F5)'
    exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
  - name: US固定支付IP
    type: select
    include-all: true
    include-all-proxies: true
    include-all-providers: true
    filter: '(?i)(美国|美國|洛杉矶|洛杉磯|西雅图|西雅圖|纽约|紐約|usa|united states|america|\bus\b|🇺🇸|\\U0001F1FA\\U0001F1F8)'
    exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
  - name: 通用分组
    type: select
    include-all: true
    include-all-proxies: true
    include-all-providers: true
    filter: '(?i)(日本|东京|東京|大阪|japan|tokyo|\bjp\b|🇯🇵|\\U0001F1EF\\U0001F1F5|美国|美國|洛杉矶|洛杉磯|西雅图|西雅圖|纽约|紐約|usa|united states|america|\bus\b|🇺🇸|\\U0001F1FA\\U0001F1F8)'
    exclude-filter: '(?i)(剩余流量|距离下次重置|下次重置剩余|重置剩余|套餐到期|到期时间|流量重置|traffic|expire|expiration|subscription|subscribe|reset|plan|建议|AI)'
append: []
delete: []
```

## 八、rules 增强文件要求

在“分流专区”的 `option.rules` 文件中插入规则，顺序必须如下：

```yaml
prepend:
  - DOMAIN-SUFFIX,chatgpt.com,JP固定注册IP
  - DOMAIN-SUFFIX,openai.com,JP固定注册IP
  - DOMAIN,auth.openai.com,JP固定注册IP
  - DOMAIN,pay.openai.com,JP固定注册IP
  - DOMAIN,www.paypal.com,US固定支付IP
  - DOMAIN-SUFFIX,paypal.com,US固定支付IP
  - DOMAIN-SUFFIX,recaptcha.net,US固定支付IP
  - DOMAIN,checkout.stripe.com,US固定支付IP
  - DOMAIN-SUFFIX,midtrans.com,US固定支付IP
  - DOMAIN-SUFFIX,yourapi.com,US固定支付IP
  - MATCH,通用分组
append: []
delete: []
```

分流含义：

- `chatgpt.com` 走 `JP固定注册IP`
- `openai.com` 走 `JP固定注册IP`
- `auth.openai.com` 走 `JP固定注册IP`
- `pay.openai.com` 走 `JP固定注册IP`
- PayPal / Stripe / reCAPTCHA / Midtrans / yourapi 走 `US固定支付IP`
- 其它所有流量通过 `MATCH,通用分组` 走 `通用分组`

## 九、模式要求

确保以下文件里是规则模式：

```yaml
mode: rule
```

需要检查并必要时修改：

- `config.yaml`
- `clash-verge.yaml`
- `clash-verge-check.yaml`

不要设置为：

```yaml
mode: global
```

## 十、修改后校验

修改完成后必须校验：

1. “分流专区”存在，且 `profiles.yaml` 中为 `type: local`。
2. “分流专区”绑定了 `option.rules`、`option.proxies`、`option.groups`。
3. `option.proxies` 文件中已经汇总远程订阅节点。
4. 如果用户要求排除某订阅，例如“冲上云霄”，节点池中不能出现该订阅名前缀。
5. 如果用户要求使用某订阅，例如“魔戒.net”，节点池中必须出现该订阅名前缀。
6. `JP固定注册IP`、`US固定支付IP` 和 `通用分组` 都是 `type: select`。
7. `JP固定注册IP` 能匹配到至少 1 个 JP 节点。
8. `US固定支付IP` 能匹配到至少 1 个 US 节点。
9. `通用分组` 能匹配到至少 1 个 JP 节点和至少 1 个 US 节点。
10. rules 文件顶部规则顺序正确，且兜底规则是 `MATCH,通用分组`。
11. `mode` 是 `rule`，不是 `global`。

## 十一、用户操作提醒

完成后提醒用户：

1. 在 Clash Verge 中切换到 `分流专区`。
2. 点击 `Reload Profile` 或重启 Clash Verge。
3. 打开 `JP固定注册IP`，手动选择注册用 JP 节点。
4. 打开 `US固定支付IP`，手动选择支付用 US 节点。
5. 打开 `通用分组`，手动选择访问其它网站使用的 JP 或 US 节点。
6. Clash Verge 必须处于规则模式 / Rule，不要使用全局模式 / Global。

如果 Reload 后两个分组为空，说明节点没有正确进入“分流专区”的最终配置，需要检查：

- `option.proxies` 是否绑定到“分流专区”。
- proxies 增强文件是否完整复制了节点对象。
- 节点名称是否能被 JP / US filter 命中。
- 当前实际启用的 profile 是否是“分流专区”。

## 十二、可选测试命令

Reload 后可以用下面命令辅助测试：

```bash
curl.exe -I --proxy http://127.0.0.1:7897 --max-time 15 https://chatgpt.com/
curl.exe -I --proxy http://127.0.0.1:7897 --max-time 15 https://pay.openai.com/
curl.exe -I --proxy http://127.0.0.1:7897 --max-time 15 https://www.paypal.com/
```

同时查看 Clash Verge Logs：

- `chatgpt.com`、`openai.com`、`pay.openai.com` 应命中 `JP固定注册IP`
- `paypal.com`、`www.paypal.com` 应命中 `US固定支付IP`
- 其它普通流量应命中 `通用分组`
- 日志不应显示 `using GLOBAL`

## 十三、最终报告格式

请最后用中文报告：

- Clash Verge 配置目录。
- 是否创建或复用了“分流专区”。
- “分流专区”的 uid。
- 修改了哪些文件。
- 创建了哪些备份。
- 收集了哪些订阅作为节点来源。
- 是否排除了用户指定不用的订阅。
- 汇总节点总数、JP 命中数、US 命中数。
- 创建或更新的分组。
- 插入的规则列表。
- 是否确认 `mode: rule`。
- 是否需要用户手动 Reload Profile。
````
