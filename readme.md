
# 基于二进制的数据表

## 分支说明
- version1: 完成json转db 再读取回json
- version2: 新增jszip功能 压缩测试 方案分析；重复字符串测试；读写测试；
- version3: 完成基于jszip的整体实现 简化2中的无用内容


## 原始json格式
- heads.json  表头信息：所有表名、表头、表头类型、双键映射(多列映射为id)、总表数
```json
     tables:["activity", "skill"]
     heads: [
         ["id", "name", "time"],
         ["id", "name", "effect"]
     ]
     heads_type: [  -2:int 1:string 2:json;
                   int 默认是 -2 string 默认是""" json 默认 是 null
         [-2, 1, 0],
         [-2, 1, 2],
     double_keys:[  列的约定在导表工具中 这里并不知道 只有做业务的人清楚
         "beatGame_treasure":{"999_1":1,"1001_2":2,
         "rule_worldSkill":{"-1_0":1000,"1_1":1001,
     ]
     "file_num":2  有几个data文件 浏览器限制了5M的大小 超过后不缓存 每次都下载  小游戏是否也会?
```
    
- data-1.json data2.json
```json
      values:[
         [ 表-1的数据
             [-1, "name1", 1000],
             [0, "name2", 2000],
         ],
      ]
```

## 第一版：先转为二进制数据 比对大小
```
    heads.json data-1.json data2.json
    原始大小：143k        4.34M      2.5M
    第一版：  37.4k       4.01M      2.28M  .db
    格式：
    head.db
     head_info: 表头信息部分
      version: uint32   20240626
      file_num: uint8
      tables_num: varint
        for tables:
          name: utf6string
          headdata_off: varint head_data数据块中的偏移 将head和head_type单独存储 减少预解析量
          bodydata_off: varint body.db数据块中的偏移
          bodydata_index: uint6 第几个data文件

     head_data: 表头数据部分
          for table1  headDataOffset 每个表的数据偏移量
            heads_num: uint8 列数
            heads: [utf8string, ...] 
            heads_type: [uint8, ...]

    data*.db
     body_data-1: 表内容数据
      version: uint32   20240626
      body_table_num: varint 这个data*.db中包含的表数量
      for 
        table-1:
         double_keys num: varint
         for
            [<utf6string, varint>, ...]  映射对 {key:value, ...}

         values_num: varint 某个表的数据行数 
            根据heads_type读取内容 0:int 1:string 2:json 3:float 4:any
            for rows
              for columes
            [ [varint, string, ...], [...], ...]  json采用字符串方式存储和解析
```


## 第二版 将字符串单独存储 降低db大小
```
          heads.json data-1.json data2.json
    原始大小：146k     4.34M      2.5M  总6.99  zip:762K
    第一版：  24k      1.17M      765K  string.db2.12M 总：4.07M  zip:897K
```


###  方案
1. 新增string.db
2. 出现的字符串全部替换为varint-偏移值
3. 读取数据时 若head_type为string 则动态从strings.db中解析出字符串


### 读取速度对比
```
  json:88ms
  db:244ms 
  分析原因：
    json整体字符串一起分析
    二进制根据表逐个解析 逐条解析内容; 流程更复杂 所以更久
```


### 纯粹json和db数据对比
测试head head_type有没必要转二进制
``` 
      大小  写入输入  读取+解析
  json:180k  2ms    0ms
  db: 146k   11ms  23ms
```
-结论：除了大一点，若整体保存和解析，则json完胜
- db的使用场合：需要动态解析时，保持内存一块很小的部分，再根据需要解析出具体某部分数据


### 字符串保存用db方式会变大还是变小
```
  str = "hello世界".repeat(1000);
  原始txt 11000字节
  writeutf8str 11002字节
  解释：
    二进制方式多了一个int16的长度
    原始txt方式 估计是一直到文件结尾 所以少2字节

  "hello世界123456789"
  json:20bit
  db:17bit
  分析：字符串部分 db多2字节 
    数字部分 db 4字节 原始：9字节  少5字节
    所以总db少3字节

  str = "hello世界123456789".repeat(100);
  byte.writeInt32(123456789)
  原始txt 2000字节
  writeutf8str writeInt32 1502字节
  分析：
   123456789 字符串方式 9字节； int32：4字节
   5*100-2 = 498
 
  结论：只要字符串长度超过8字节 就能省内存；反之，原始串更小
```


### string重复分析
有多少重复的字符串？
重复的部分有多少是夸文件的？

- 数据量对比
```
  全部大小：6.06M
  去重大小：2.24M
  根据数据抓取重复字符 安装次数 占的表数 排序后：
    "null": 33944 几十个表
    "":空字符串 24984  几十个表
    { count: 11520, str: '可在套装界面内装备', desc: [ 'suit_suitEquip' ] },
    { count: 3773, str: 'add_buff', desc: [ 'skill_effect' ] },
    { count: 2877, str: 'change_attr', desc: [ 'skill_buff' ] },
    类似的还有name id
    ...
    {
    count: 470,
    str: '["云游寻宝","sys_treasure",[0],31]',
    desc: [
      'backgroundActive_activeTask',
      'backgroundActive_battlePassTask',
      'backgroundActive_bgActive3Task',
      'openActive_activeTask',
      'return_returnTask',
      'slg_activeBpTask'
    ]
    },
    ...
    { count: 279, str: 'buff/+shanghai.png', desc: [ 'skill_buff' ] },
    ...
    { count: 144, str: '麻痹项链', desc: [ 'suit_suitEquip' ] },
    结论：
    只有少量特殊字符串 才会覆盖大量的表
    大部分情况都在某个表内部 才会出现大量重复
```
- 方案：字符串去重 根据表名拆分；方便动态读取和解析；方便使用jszip库


## 第三版 基于压缩技术

- 方案1：
``` 
    所有的单个表数据 独立zip压缩  就不用在游戏中加载大的buffer
    只需在需要时 动态解析出数据内容
    包含两块数据：head_data body_data
``` 
- jszip
[jszip](https://stuk.github.io/jszip/) 只支持文件级别的压缩和解压；适合对整个db文件压缩
换个思路：每个表头或表内容 都当做一个内部文件  通过zip.file(name).async("string/uint8array")来动态得到解析的内容
- 格式定义1
```
  head.zip
    count varint
    [<name:{bodyidx,data_off}>}

  data1.zip data2.zip 每个表单独一个string块 用于去重 放到表数据后
    某一个表的数据  通过data_off来读取这个表的所有内容
      double_key_count 多列映射数
       for 
        key: utf8str
        id: any 可能是number或字符串 看表的配置 但肯定是第一列
      row_count 数据行数
       for 根据head_type写入数据
        [id, name, ....]
      string_buffer: 上面用的所有字符串 都在这个块内 通过offset读取utf8string 
        
  zipFile.file("name").async("nodebuffer");
``` 
- 再次优化double_key: 没有采用二进制解析的必要，已经走了zip，所以真快使用json字符串
- data部分：本身就想只解析某一条，像skill类大表就没必要全部解析到json内存中，所以通过二进制方式存储
- 格式定义2
```
  heads.zip
    count varint
    [<name:{bodyidx, body_off, data_off, str_off}>}

  data1.zip data2.zip 每个表单独一个string块 用于去重 放到表数据后
    某一个表的数据  通过data_off来读取这个表的所有内容
    :body_off
      head: 表头名称 ["id", "name", "title", ...]  json string
      head_type: 表头类型 [number, string, ...] json string
      row_count 数据行数  varint 
      data_line_size 单行大小  varint
      ids:[id1,id2] json string  id=>行索引*行大小=偏移=>读取这个表的某一行数据
      double_key: utf8string  可能是空字符串 若没有映射表
       for 根据head_type写入数据  :data_off
        [id, name, ....]
      string_buffer: 上面用的所有字符串 都在这个块内 通过offset读取utf8string  :str_off
        
  zipFile.file("heads").async("nodebuffer");
``` 
- 再次优化double_key: 没有采用二进制解析的必要，已经走了zip，所以真快使用json字符串
- 根据整体压缩效果900k以内 所以不再区分多个data文件 所有文件都在一个压缩包中
- 省去head 也放入table中
- 格式定义3
```
  data.db
    table1  全部以单独的表压缩保存
    table2
    ...

  table 每个表单独一个string块 用于去重 放到表数据后
    某一个表的数据  通过data_off来读取这个表的所有内容
      head: 表头通用信息 {row_count, line_data_size, data_off, strblock_off}  json string
        row_count 数据行数  
        data_line_size 单行大小
      head_title: 表头名称 ["id", "name", "title", ...]  json string
      head_type: 表头类型 [number, string, ...] json string
      ids:[id1,id2] json string  id=>行索引*行大小=偏移=>读取这个表的某一行数据
      double_key: json string 可能是null 若没有映射表
    :data_off  数据块起始
       for 根据head_type写入数据
        [id, name, ....]
    :strblock_off
      string_buffer: 上面用的所有字符串 都在这个块内 通过offset读取utf8string
        
  zipFile.file("heads").async("nodebuffer");
``` 
- 测试结果
```
  data.zip 
  压缩等级9: 1.26M  带names表
  压缩等级1: 1.39M

  时间：
  read json:86ms
  read .zip+load bufer 14ms
  read one table:5ms
  parse one line:1ms
```
- 遗留问题：
读表函数是异步的 无法和业务协调使用
解决：使用早期的jszip库2.6.1 使用同步方式读写




## 第四版 模拟项目运行时状态 根据表名动态读取head_data body_data
- 方案
``` 
  由于jszip按文件目录压缩 第二版中的按照偏移方案来解析 
  数据结构重新设计 全部按表名映射：head head_type double_key body_data
  怎样只解析某一行数据 而非整个表？
  第一层解析：jszip中安表明生成一个buffer文件 解析出缓存
    name:{buffer}
  第二层解析： 由于所有的string都用偏移代替 所以每行占的二进制大小相同
    {buffer, doublekey, data:{id:line}, allunziped:true}  判断是否全部解析 且可以丢弃buffer对象
    headinfo: [head][head_type] double_off body_off [doublekey_data] [body_data]
    doublekey_data: map_count block_size key_array[key1,key2] {<key:value>, <string:id>}
        key=>id
        map中kv对数量 单个ky块的大小-用于计算偏移 所有key的数组-从小到大排序-
        使用时快排定位，得到第几个索引+块偏移 得到具体的buffer offset 再读取这块数据
    body_data line_count line_size id_array[id1,id2,...] [[line1], [id,name,level,...]]
       单行模式 id=>line 读取方式类似上面
       整个表遍历 则一次解析出所有的内容 直接跳到数据块部分
``` 
