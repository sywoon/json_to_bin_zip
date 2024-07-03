const { assert } = require("console");
const fs = require("fs");
const Byte = require("./Byte").Byte;

let showlog = false;

class DbWriter {
    constructor() {}

    //json格式：
    // heads.json  表头信息：所有表名、表头、表头类型、双键映射(多列映射为id)、总表数
    //  tables:["activity", "skill"]
    //  heads: [
    //      ["id", "name", "time"],
    //      ["id", "name", "effect"]
    //  ]
    //  heads_type: [  0:int 1:string 2:json;
    //                int 默认是 0 string 默认是""" json 默认 是 null
    //      [0, 1, 0],
    //      [0, 1, 2],
    //  double_keys:[  列的约定在导表工具中 这里并不知道 只有做业务的人清楚
    //      "beatGame_treasure":{"1001_1":1,"1001_2":2,
    //      "rule_worldSkill":{"1_0":1000,"1_1":1001,
    //  ]
    //  "file_num":2
    //
    // data1.json data2.json
    //   values:[
    //      [ 表1的数据
    //          [1, "name1", 1000],
    //          [2, "name2", 2000],
    //      ],
    //   ]

    //第一版：先转为二进制数据 比对大小
    //          heads.json data1.json data2.json
    // 原始大小：145k        4.34M      2.5M
    // 第一版：  39.4k       4.01M      2.28M
    // 格式：
    //  head_info: 表头信息部分
    //   version: uint16   20240626
    //   file_num: uint8
    //   tables_num: uint16
    //     table1:
    //       name: utf8string
    //       headdata_off: uint32 数据块中的偏移
    //       bodydata_off: uint32 数据块中的偏移
    //       bodydata_index: uint8 第几个数据文件

    //  head_data: 表头数据部分
    //       heads_num: uint8 列数
    //         heads: [utf8string, ...]
    //         heads_type: [uint8, ...]

    //  body_data1: 表内容数据
    //   version: uint16   20240626
    //    table1:
    //      double_keys num: uint16
    //         [<utf8string, uint16>, ...]  映射对
    //      values_num: uint16  根据heads_type读取内容 0:int 1:string 2:json 3:float 4:any
    //         [ [int16, string, ...], [...], ...]  json采用字符串方式存储和解析

    jsonToBin() {
        let heads = this.readJson("heads");
        // console.log("head", heads["file_num"], heads["tables"].length);

        // { headOffset: byte.pos, bodyOffset: byte.pos, tableIdx: tableIdx, dataFileIdx: dataFileIdx, name: name }
        let tablesInfo = []; 
        let bodyBytes = [];   //每个data文件的二进制数据byte对象
        let tableIdx = 0;
        for (let i = 0; i < heads["file_num"]; i++) {
            let bodyData = this.readJson(`data${i + 1}`);  //一个data*.json文件
            let byte = this.bodyToBin(tableIdx, i, heads, bodyData, tablesInfo);
            bodyBytes.push(byte);
            tableIdx += bodyData.values.length;
        }

        let headByte = this.headToBin(heads, tablesInfo);
        this.saveBin(headByte, bodyBytes);
    }

    saveBin(headByte, bodyBytes) {
        try {
            fs.mkdirSync("./data", { recursive: true });
            let pathHead = `./data/heads.db`;
            fs.writeFileSync(pathHead, Buffer.from(headByte.buffer));

            for (let i = 0; i < bodyBytes.length; i++) {
                let pathBody = `./data/data${i + 1}.db`;
                fs.writeFileSync(pathBody, Buffer.from(bodyBytes[i].buffer));
            }
        } catch (err) {
            console.error("save bin file failed", err);
        }
    }

    //tableStart:表开始索引 由于有多个data文件 且公用一个head
    //bodyIdx: 第几个data文件
    bodyToBin(tableStart, dataFileIdx, heads, bodyData, tablesInfo) {
        assert(heads["tables"].length >= bodyData.values.length, "body data error");

        let byte = new Byte();
        let date = new Date();
        byte.writeUint32(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate());
        byte.writeUint32(bodyData.values.length);  //当前data包含的表数  注意不是：heads["tables"].length

        for (let i = 0; i < bodyData.values.length; i++) {
            let tableIdx = i + tableStart;
            let name = heads["tables"][tableIdx];
            let head = heads["heads"][tableIdx];
            let head_type = heads["heads_type"][tableIdx];
            let double_keys = heads["double_keys"][name]
            let body = bodyData.values[i];
            //每个表数据的偏移
            //有多个data文件 按顺序叠加
            tablesInfo.push({ bodyOffset: byte.pos, tableIdx: tableIdx, dataFileIdx: dataFileIdx, name: name });

            showlog |= name === "suit_suitDecompose";
            // showlog && console.log("writebody", i, name, byte.pos, byte.length);
            this.oneTableBodyToBin(byte, name, head, head_type, double_keys, body);
        }
        return byte;
    }

    // data*.json => data*.db
    //  name: utf8string
    //  double_keys: uint16 有多少列映射到id
    //    for: map映射 数据量还挺多
    //      key: utf8string  多列的关联 "1_0"
    //      value: uint16  id 1000
    //  values: uint16 有多少行数据
    //    for: 行数据
    //      for: 列数据
    //        value: 根据head类型0:int 1:string 2:json 3:float 4:any 写入方式不同
    oneTableBodyToBin(byte, name, head, head_type, double_keys, body) {
        byte.writeUTFString(name); //方便读取时验证

        if (!double_keys) {
            byte.writeVarInt(0); // double_keys num
        } else {
            let len = Object.keys(double_keys).length;
            byte.writeVarInt(len);
            for (let key of Object.keys(double_keys)) {
                byte.writeUTFString(key);
                byte.writeVarInt(double_keys[key]);
            }
        }

        // showlog && console.log("body", name, body.length, head_type, head);
        byte.writeVarInt(body.length);
        for (let j = 0; j < body.length; j++) {  //line
            for (let k = 0; k < body[j].length; k++) {  //column
                //0:int 1:string 2:json 3:float 4:any
                let v = body[j][k];
                if (head_type[k] == 0) {
                    byte.writeVarInt(v);
                } else if (head_type[k] == 1) {
                    byte.writeUTFString(v);
                } else if (head_type[k] == 2) {
                    byte.writeUTFString(JSON.stringify(v));
                } else if (head_type[k] == 3) {
                    byte.writeFloat32(v);
                } else if (head_type[k] == 4) {
                    byte.writeAny(v);
                } else {
                    console.error("head type error", head_type[k]);
                }
            }
        }
    }

    //为了减少head部分的解析 将表头数据独立存放 只有用到某个表时 才需要解析这块数据
    // for tables:   单个表、单个表... 多块独立 可动态读取
    //   col_num: uint8 列数
    //     name: utf8string
    //     type: uint8  0:int 1:string 2:json 3:float 4:any
    headDataToBin(heads, tablesInfo) {
        assert(heads["tables"].length == tablesInfo.length, "tables num error")
        let byte = new Byte();
        for (let i = 0; i < heads["tables"].length; i++) {
            let name = heads["tables"][i];
            assert(name == tablesInfo[i]["name"], "table name error", name, tablesInfo[i]["name"]);
            tablesInfo[i]["headOffset"] = byte.pos;

            let head = heads["heads"][i];
            let head_type = heads["heads_type"][i];
            byte.writeUint8(head.length);
            for (let j = 0; j < head.length; j++) {
                byte.writeUTFString(head[j]);
            }
            for (let j = 0; j < head_type.length; j++) {
                byte.writeUint8(head_type[j]);
            }
        }
        return byte;
    }

    // head二进制格式数据
    //  version: uint16   20240626
    //  file_num: uint8
    //  tables_num: uint16
    //    for: tables_num
    //      name: utf8string    表名
    //      headdata_off: varint head数据块中的偏移
    //      bodydata_off: varint body数据块中的偏移
    //      datafile_index: uint8 第几个数据文件
    headToBin(heads, tablesInfo) {
        assert(heads["tables"].length == tablesInfo.length, "body num error");

        let headDataByte = this.headDataToBin(heads, tablesInfo);
        assert(heads["tables"].length == tablesInfo.length, "headdata num error");

        let byte = new Byte();
        let date = new Date();
        let dateValue = date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
        byte.writeUint32(dateValue);  //20240603
        byte.writeUint8(heads["file_num"]);
        byte.writeVarInt(heads["tables"].length);

        // console.log("write head", dateValue, heads["file_num"], heads["tables"].length, byte.endian)
        for (let i = 0; i < heads["tables"].length; i++) {
            let tableInfo = tablesInfo[i];  //{ headOffset: byte.pos, bodyOffset: byte.pos, tableIdx: tableIdx, dataFileIdx: dataFileIdx, name: name }
            byte.writeUTFString(tableInfo["name"]);
            byte.writeVarInt(tableInfo["headOffset"]); // headdata_off
            byte.writeVarInt(tableInfo["bodyOffset"]); // bodydata_off
            byte.writeUint8(tableInfo["dataFileIdx"]); // dataFile_index
        }

        byte.writeArrayBuffer(headDataByte.buffer);
        return byte;
    }

    readJson(name) {
        let path = `./json/${name}.json`;
        let data = null;
        try {
            const text = fs.readFileSync(path, "utf8");
            data = JSON.parse(text);
        } catch (err) {
            console.error(`read failed:${path}`, err);
        }
        return data;
    }
}

module.exports = DbWriter;

//参考1：某个表的格式
//  |--------|
//  |  head  |  id:c16唯一标识-防伪？ version:u16 fileds_num:u16 rows_num:u16 strBlock_size:u32
//  |--------|   "COPYRIGHT@SQL1    20130818   3    3    130
//  | fileds |  type:u8 str_off:u32, ...
//  |--------|
//  |  data  |  根据field的类型读取数据
//  |--------|
//  | string |  字符串块-去重 根据偏移来获取
//  |--------|
// 表头格式定义：
// DEF({	type = 'Platform'		, file = ''						, desc = "平台差异"						},
// 	{	index = 'name'				, value = ''					, desc = "字段名"						},
// 	{	field = 'win32'				, value = ''					, desc = "win32平台下值"				},
// 	{	field = 'ios'				, value = ''					, desc = "ios平台下值"					},
// 	{	field = 'android'			, value = ''					, desc = "android平台下值"				},
// 	{	field = 'note'				, value = ''					, desc = "备注"							},
// 	{})
