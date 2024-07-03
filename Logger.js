class Logger {
    static styles = {
        'reset': '\x1B[0m',
        'bright': '\x1B[1m', // 亮色
        'grey': '\x1B[2m', // 灰色
        'italic': '\x1B[3m', // 斜体
        'underline': '\x1B[4m', // 下划线
        'reverse': '\x1B[7m', // 反向
        'hidden': '\x1B[8m', // 隐藏
        'black': '\x1B[30m', // 黑色
        'red': '\x1B[31m', // 红色
        'green': '\x1B[32m', // 绿色
        'yellow': '\x1B[33m', // 黄色
        'blue': '\x1B[34m', // 蓝色
        'magenta': '\x1B[35m', // 品红
        'cyan': '\x1B[36m', // 青色
        'white': '\x1B[37m', // 白色
        'blackBG': '\x1B[40m', // 背景色为黑色
        'redBG': '\x1B[41m', // 背景色为红色
        'greenBG': '\x1B[42m', // 背景色为绿色
        'yellowBG': '\x1B[43m', // 背景色为黄色
        'blueBG': '\x1B[44m', // 背景色为蓝色
        'magentaBG': '\x1B[45m', // 背景色为品红
        'cyanBG': '\x1B[46m', // 背景色为青色
        'whiteBG': '\x1B[47m' // 背景色为白色
    }

    static openLog = true;
    static _originConsole = {};

    static init() {
        if (null == Logger._originConsole["i"]) {
            Logger._originConsole["i"] = console.log;
            Logger._originConsole["d"] = console.debug;
            Logger._originConsole["w"] = console.warn;
            Logger._originConsole["e"] = console.error;
        }

        console.log = (...args) => {
            if (!Logger.openLog)
                return;
            Logger._originConsole["i"](...args);
            // Logger._originConsole["i"](Logger.colors(color, ...args));
        }

        console.warn = (...args) => {
            if (!Logger.openLog)
                return;
            Logger._originConsole["w"](Logger.colors("yellow", ...args));
        }

        console.error = (...args) => {
            if (!Logger.openLog)
                return;
            Logger._originConsole["e"](Logger.colors("red", ...args));
        }
    }

    static any2str(msg) {
        if (typeof msg === "string") {
            return msg;
        }
        else if (typeof msg === "object") {
            try {
                msg = JSON.stringify(msg);
            } catch (error) {
                msg = String(msg);
            }
            return msg;
        } else {
            return String(msg);
        }
    }

    static args2str(...args) {
        let arr = [];
        for (var i = 0; i < args.length; i++) {
            let msg = args[i];
            msg = Logger.any2str(msg);
            arr.push(msg)
        }

        let text = arr.join("\t");
        return text;
    }

    // c for color
    static logc(color, ...args) {
        console.log(Logger.colors(color, ...args));
    }

    // keys: string | Array<string>
    static colors(keys, ...args) {
        let source = Logger.args2str(...args);

        let styles = Logger.styles;
        var values = ''
        if (typeof keys === 'string') {
            values = styles[keys]
        }
        else {
            keys.forEach(key => {
                values += styles[key]
            });
        }
        return values + source + styles['reset'];
    }
}

module.exports = Logger;