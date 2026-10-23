---
name: memory-organize
description: 用户要求整理记忆时，分类偏好、项目决定与历史资料，合并重复并保留来源。
---

# 整理已有记忆

使用当前会话的 memory_list、memory_search、memory_read、memory_save、memory_update。不要调用另一个模型，不新增常驻说明或重复的摘要层。

1. 用 memory_list(limit=50) 获取用户与当前项目的条目及 references，分批 memory_read 相关全文。列表有截断时用主题关键词继续搜索。保留每条的 id、scope、来源和原有日期；超长记录返回 truncated 时，先读取 local_file 中剩余内容再改写。
2. 按用途决定归属：跨项目偏好用 user + memory；仅当前项目成立的决定用 project + memory；历史配置、会话 ID、日志、长教程用相应 scope + reference。项目归属不明的条目先不动，查当前工作区资料，仍无法确定再集中问用户。历史事实不能改写成当前指令。
3. 先形成简短分类/合并计划。用户已要求执行整理即可推进；只要求分析时不写入。memory_update 的 scope 是原位置，targetScope 是新位置；project 永远是当前会话项目，不能借此迁移到其他项目。可直接更新 kind，无需重写全文。
4. 合并重复主题时先 memory_save 一条简短、自足的结论，content 中保留原 scope/id 和必要出处；确认保存成功，再把被替代的原条目通过 memory_update 改为 reference。新记录使用不同于来源的标题，避免同标题更新覆盖源记录。原条目仍可查证，不删除来源。
5. 单条重分类/纠错用 memory_update(id, scope, targetScope?, kind?, title?, content?)。每次更新/迁移会先备份原文；返回 backup_file 仅供需要还原时定位，不把备份导入记忆。工具报错时保留未处理条目，先核对已经成功的变更再继续，勿重复盲写。
6. 完成后重新 list/search/read 核对归属、来源与结果。交付分类/合并数量、未改动项和原因。不要声称已整理未实际读取的记录，不自动生成 Skill；只有某份教程确实适合复用且用户要求时再单独处理。
