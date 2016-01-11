/**
 * @file 抓取上海地铁运行情况数据
 * @author Kyle He (x@hk1229.cn)
 * @description
 * 有个X盾的东西，直接读地铁官网的接口返回的不是 json 数据而是一段混淆的js，这里尝试绕过这个机制抓到数据
 *
 * ## 怎么绕过？
 * 目前试出来的机制是第一次访问接口或者运行状态页面的时候会返回一个只包含了混淆 JS 的页面
 * 这个页面里混淆 JS 的功能就是生成一个带 token 的运行状态页面的 url 并跳转
 * 请求下这个 url 再读取接口就能正常返回数据了
 *
 * ## 为什么要抓人家的数据？
 * 1. 地铁算公共资源吧，运行情况数据理应公开（不懂，错了请指出）
 * 2. 通过 app，及时推送故障信息（如果官网更新够及时的话）
 */

var request = require('request');
var cheerio = require('cheerio');
var fs = require('fs');

/**
 * 主机
 *
 * @type {String}
 */
const HOST = 'http://service.shmetro.com';

/**
 * 缓存文件名
 *
 * @type {String}
 */
const CACHE_STATUS_FILE = './shmetro-status.json';

/**
 * 最大重试次数
 *
 * @type {Number}
 */
const MAX_RETRY_COUNT = 10;

var requestCount = 0;

/**
 * 加载页面
 *
 * @param  {string} path 路径
 * @return {Promise}
 */
function loadPage(path) {
    console.log('Load page ' + path);
    if (requestCount++ > MAX_RETRY_COUNT) {
        throw new Error('too many requests');
    }
    return new Promise(function (resolve, reject) {
        request(HOST + path, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                // 这里就通过 html 区分下，细扣下 headers 应该也能找出差异
                if (body.indexOf('<!DOCTYPE html') >= 0) {
                    // 正常的情况下返回的是标准的 <!DOCTYPE 开头的 HTML
                    resolve(response);
                }
                else if (body.indexOf('<html><body><script language=') >= 0) {
                    // 错误返回的是只有一段混淆后的 js 的页面
                    reject(body);
                } else {
                    // 还有其他情况？
                    console.log(JSON.stringify(response));
                    throw new Error('Unexpected error');
                }
            }
            else {
                throw error;
            }
        });
    }).then(function (response) {
        // 真的页面
        // var i = response.body.indexOf('<script>');
        // console.log(response.body.substring(i, i + 400));
        return response;
    }, function (body) {
        // 跳转页面
        console.log(body);
        var redirectUrl = parseRedirect(body);
        return loadPage(redirectUrl);
    }).catch(function (err) {
        console.log(err.stack);
        process.exit(2);
    });
}

/**
 * 从混淆的 JS 里提取出带 token 的跳转 url
 *
 * @param  {string} body 错误页面html
 * @return {string}      跳转url
 */
function parseRedirect(body) {
    var $ = cheerio.load(body);
    var js = $('script').text();
    // onload 改成直接执行
    js = js.replace('window.onload=', '');
    // 最后一个 eval 传入 window.location 赋值的表达式来跳转页面
    // 这里替换下 eval，得到赋值表达式
    js = lastReplace(js, 'eval', 'setFinalJs');

    var finalExpression;
    function setFinalJs(js) {
        // 大概长这样
        // window.location="/gxyxqk/index.jhtml?yundun=57945262064303217742"
        finalExpression = js;
    }
    eval(js);

    return finalExpression.substring(
        finalExpression.indexOf('/'),
        finalExpression.lastIndexOf('"')
    );
}

function lastReplace(str, oldVal, newVal) {
    var i = str.lastIndexOf(oldVal);
    if (i >= 0) {
        return str.substring(0, i) + newVal + str.substring(i + oldVal.length);
    } else {
        return str;
    }
}

/**
 * 读运行状态接口
 *
 * @return {Promise}
 */
function getMetroStatus() {
    var path = '/i/sm?method=doGetAllLineStatus';
    console.log('Load page ' + path);
    return new Promise(function (resolve, reject) {
        request.post({
            url: HOST + path,
            form: {
                method: 'doGetAllLineStatus'
            }
        }, function(err, response, body) {
            if (err) {
                throw err;
            }
            if (body.indexOf('<html><body><script language=') >= 0) {
                return loadPage(parseRedirect(body));
            }
            else {
                resolve(response);
            }
        });
    });
}


// for crontab log
console.log((new Date()).toUTCString());


// start
loadPage('/gxyxqk/index.jhtml').then(function (response) {
    return getMetroStatus();
}).then(function (response) {
    console.log(response.body);
    return JSON.parse(response.body); // 如果解析出错就说明抓到的不对，抛错即可
}).then(function (data) {
    // 缓存到本地文件
    return new Promise(function (resolve, reject) {
        fs.writeFile(CACHE_STATUS_FILE, JSON.stringify(data, null, 4), function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}).catch(function (err) {
    console.log(err.stack);
    process.exit(3);
});












