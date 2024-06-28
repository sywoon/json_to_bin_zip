const { assert } = require('console');
const fs = require('fs');
const Byte = require ("./Byte").Byte

class DbWriter {
    constructor() {
    }

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
        let heads = this.readJson('heads');
        console.log("head", heads["file_num"], heads["tables"].length)

        let bodysInfo = []
        let bodyBytes = []
        let tableIdx = 0
        for (let i = 0; i<heads["file_num"]; i++) {
            let bodys = this.readJson(`data${i+1}`);
            let byte = this.bodyToBin(tableIdx, i, heads, bodys, bodysInfo)
            bodyBytes.push(byte)
            tableIdx += bodys.values.length
        }

        let headByte = this.headToBin(heads, bodysInfo)
        this.saveBin(headByte, bodyBytes)
    }

    saveBin(headByte, bodyBytes) {
        try {
            fs.mkdirSync('./data', { recursive: true });
            let pathHead = `./data/heads.db`;
            fs.writeFileSync(pathHead, Buffer.from(headByte.buffer))

            for (let i = 0; i<bodyBytes.length; i++) {
                let pathBody = `./data/data${i}.db`
                fs.writeFileSync(pathBody , Buffer.from(bodyBytes[i].buffer))
            }
        } catch (err) {
            console.error("save bin file failed", err);
        }
    }

    //tableIdx:表开始索引 由于有多个data文件 且公用一个head
    bodyToBin(tableIdx, bodyIdx, heads, bodys, bodysInfo) {
        assert(heads["tables"].length >= bodys.values.length, "body data error")

        let byte = new Byte()
        let date = new Date()
        byte.writeUint16(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate())
        byte.writeVarInt(heads["tables"].length)

        for (let i = 0; i < bodys.values.length; i++) {
            let name = heads["tables"][i+tableIdx]
            let head = heads["heads"][i+tableIdx]
            let head_type = heads["heads_type"][i+tableIdx]
            let body = bodys.values[i]

            //每个表数据的偏移
            //有多个data文件 按顺序叠加 
            bodysInfo.push({offset:byte.pos, bodyIdx:bodyIdx})  
            if (!heads["double_keys"][name]) {
                byte.writeInt16(0) // double_keys num
            } else {
                let double_keys = heads["double_keys"][name]
                let len = Object.keys(double_keys).length
                byte.writeUint16(len)
                for (let name in double_keys) {
                    byte.writeUTFString(name)
                    byte.writeInt16(double_keys[name])
                }
            }

            console.log("body", name, body.length)
            byte.writeInt16(body.length)
            for (let j = 0; j < body.length; j++) {
                for (let k = 0; k < body[j].length; k++) {  //0:int 1:string 2:json;  
                    let v = body[j][k]
                    if (head_type[k] == 0) {
                        byte.writeVarInt(v)
                    } else if (head_type[k] == 1) {
                        byte.writeUTFString(v)
                    } else if (head_type[k] == 2) {
                        byte.writeUTFString(JSON.stringify(v))
                    } else if (head_type[k] == 3) {
                        byte.writeFloat32(JSON.stringify(v))
                    } else if (head_type[k] == 4) {
                        byte.writeAny(JSON.stringify(v))
                    }
                }
            }
        }
        return byte
    }

    //为了减少head部分的解析 将表头数据独立存放 只有用到某个表时 才需要解析这块数据
    headDataToBin(heads, headDatasInfo) {
        let byte = new Byte()
        for (let i = 0; i < heads["tables"].length; i++) {
            headDatasInfo.push({offset:byte.pos})  

            let head = heads["heads"][i]
            let head_type = heads["heads_type"][i]
            byte.writeUint8(head.length)
            for (let j = 0; j < head.length; j++) {
                byte.writeUTFString(head[j])
            }
            for (let j = 0; j < head_type.length; j++) {
                byte.writeUint8(head_type[j])
            }
        }
        return byte
    }

    headToBin(heads, bodysInfo) {
        assert(heads["tables"].length == bodysInfo.length, "body num error")

        let headsDataInfo = []
        let headDataByte = this.headDataToBin(heads, headsDataInfo)
        assert(heads["tables"].length == headsDataInfo.length, "headdata num error")

        let byte = new Byte()
        let date = new Date();
        byte.writeUint16(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate())
        byte.writeUint8(heads["file_num"])

        byte.writeVarInt(heads["tables"].length)
        for (let i = 0; i < heads["tables"].length; i++) {
            let hdInfo = headsDataInfo[i]
            let bodyInfo = bodysInfo[i]
            byte.writeUTFString(heads["tables"][i])
            byte.writeVarInt(hdInfo["offset"]) // headdata_off
            byte.writeVarInt(bodyInfo["offset"]) // bodydata_off
            byte.writeUint8(bodyInfo["bodyIdx"]) // bodydata_index
        }

        byte.writeArrayBuffer(headDataByte.buffer)
        return byte
    }

    readJson(name) {
        let path = `./json/${name}.json`;
        let data = null;
        try {
            const text = fs.readFileSync(path, 'utf8');
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


