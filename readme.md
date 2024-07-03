
# 基于二进制的数据表

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

###  方案
1. 新增string.db
2. 出现的字符串全部替换为varint-偏移值
3. 读取数据时 若head_type为string 则动态从strings.db中解析出字符串



## 第三版 模拟项目运行时状态 根据表名动态读取head_data body_data



