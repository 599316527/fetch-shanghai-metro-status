
var request = require('request');
var cheerio = require('cheerio');
var fs = require('fs');

const HOST = 'http://service.shmetro.com';
const cacheStatusFile = './shmetro-status.json';

var requestCount = 0;

function loadPage(path) {
    console.log('Load page ' + path);
    if (requestCount++ > 10) {
        throw new Error('too many requests');
    }
    return new Promise(function (resolve, reject) {
        request(HOST + path, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                if (body.indexOf('<!DOCTYPE html') >= 0) {
                    resolve(response);
                }
                else if (body.indexOf('<html><body><script language=') >= 0) {
                    reject(body);
                } else {
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
        loadPage(redirectUrl);
    }).catch(function (err) {
        console.log(err.stack);
        process.exit(2);
    });
}


function parseRedirect(body) {
    var $ = cheerio.load(body);
    var js = $('script').text();
    js = js.replace('window.onload=', '');
    js = lastReplace(js, 'eval', 'setFinalJs');
    js = 'var FINAL_JS; function setFinalJs(js){FINAL_JS = js;}' + js;
    eval(js);
    return FINAL_JS.substring(
        FINAL_JS.indexOf('/'),
        FINAL_JS.lastIndexOf('"')
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
                loadPage(parseRedirect(body));
            }
            else {
                resolve(response);
            }
        });
    });
}

loadPage('/gxyxqk/index.jhtml').then(function (response) {
    return getMetroStatus();
}).then(function (response) {
    console.log(response.body);
    return JSON.parse(response.body); // 如果解析出错就说明抓到的不对，抛错即可
}).then(function (data) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(cacheStatusFile, JSON.stringify(data, null, 4), function (err) {
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












