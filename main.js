const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const sanitize = require("sanitize-filename");
const puppeteer = require('puppeteer');
const fs = require('fs'),
    path = require("path"),
    URL = require("url"),
    rimraf = require("rimraf");
const cliProgress = require('cli-progress');
const fetch = require('node-fetch');
//const scrollPageToBottom = require('puppeteer-autoscroll-down')

let crrDomain,
    imgExt = ['jpg', 'png', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'svg']

function download(url, localPath, fn) {
    return new Promise(async resolve => {
        try {
            let parsed = URL.parse(url);
            if(parsed.hostname === null)
                url = 'http://' + crrDomain.hostname + (url.charAt(0) != "/" ? "/" : "") + url
            const response = await fetch(url);
            let ext = response.headers.get('content-type').split('/')
            if(ext[0] == "image" && imgExt.includes(ext[1])) {
                const buffer = await response.buffer();
                let fileName = localPath + '.' + ext[1] // + ' - ' + sanitize(path.basename(parsed.pathname))
                fs.writeFileSync(fileName, buffer);
                console.log('Saved to: ' + fileName)   
            }
        } catch (error) {
            console.log(error.message, 'Failed to save this url: ' + url)
        }
        if(fn) fn()
        resolve()
    })
}

function pad(num, len) {
    return Array(len + 1 - num.toString().length).join('0') + num;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchingImages(images, title) {
    if (!fs.existsSync('images'))
        fs.mkdirSync('images');
    console.log('Start download images from: ' + title)
    let startTime = Date.now()
    let pathTar = 'images/' + sanitize(title)
    if (!fs.existsSync(pathTar))
        fs.mkdirSync(pathTar);
    else {
        rimraf.sync(pathTar);
        fs.mkdirSync(pathTar);
    }
    let count = 0
    for (let index = 0; index < images.length; index++) {
        download(images[index], `${pathTar}/${pad(index, 4)}`, ()=> {
            count++;
        })
    }
    while (count < images.length) {
        await sleep(10)
    }
    let finishTime = Date.now() - startTime
    console.log(`Finished at ${finishTime} ms, Saved in ${pathTar}!\n`)
    prompt()
}

let lazyLoadOn = false;

function prompt() {
    rl.question("Website url: ", function(link) {
        crrDomainStr = link;
        crrDomain = URL.parse(link);
        if(crrDomain.host === null) {
            console.log(`Sorry, we can't parse your URL ('${crrDomainStr}').\nPlease check that your url have include a protocol (http/https).\n`)
            prompt();
            return false;
        }
        //c.queue(link)
        console.log('Loading webpage...')
        puppeteer.launch().then(async browser => {
            const page = await browser.newPage();
            const bar1 = new cliProgress.SingleBar({
                format: `Scrolling [{bar}] {percentage}% | ETA: {eta}s `
            }, cliProgress.Presets.legacy);
            page.on('console', consoleObj => {
                let progress = consoleObj.text().split("/")
                //console.log(progress)
                bar1.update(parseInt(progress[0]));
            });
            await page.goto(link);
            await page.setViewport({
                width: 800,
                height: 10000
            });
            console.log('Scanning for ' + await page.title() + '.')
            //await page.screenshot({path: 'screenshot.png'});
            if(lazyLoadOn) {
                console.log('Starting 1st Scroll... | Step 1000 | Delay 300')
                bar1.start(100, 0);
                await scrollPageToBottom(page, 9000, 1000)
                await page.evaluate(_ => {
                    window.scrollBy(0, -window.scrollY)
                });
                bar1.stop();
            }
            //await page.screenshot({path: 'screenshot.png'});
            console.log('Loading data...')
            await page.waitForTimeout(1000)
            const imgs = await page.$$eval('img[src]', imgs => imgs.map(img => img.getAttribute('src')));
            fetchingImages(imgs, await page.title())

            await browser.close();
        })
        .catch((err)=>{
            console.error("\nFail to load webpage: ", err.message)
            console.info("The script will recovery in 3 seconds..")
            setTimeout(() => {
                console.log('')
                prompt();
            }, 3000);
        });
    });
}


rl.question("Do you want to enable lazy load?\nType `yes`|`y` to enable, or leave it blank to skip: ", function(ans) {
    if(ans.toLowerCase() == "yes" || ans.toLowerCase() == "y") lazyLoadOn = true
    console.log((lazyLoadOn ? "Lazy load is now enabled!" : "Lazy load is now disabled.") + '\n')
    prompt()
})

async function scrollPageToBottom(page, scrollStep = 250, scrollDelay = 70) {
    const lastPosition = await page.evaluate(
        async (step, delay) => {
            const getScrollHeight = (element) => {
            if (!element) return 0
    
                const { scrollHeight, offsetHeight, clientHeight } = element
                return Math.max(scrollHeight, offsetHeight, clientHeight)
            }
            
            const position = await new Promise((resolve) => {
                let count = 0
                const intervalId = setInterval(() => {
                    const { body } = document
                    const availableScrollHeight = getScrollHeight(body)
                    window.scrollBy(0, step)
                    count += step
                    //console.log(`Scrolling... ${((count / availableScrollHeight) * 100).toFixed(2)}%`)
                    console.log(Math.round((count / availableScrollHeight) * 100) + '/' + 100)
                    if (count >= availableScrollHeight) {
                        clearInterval(intervalId)
                        resolve(count)
                    }
                }, delay)
            })
    
            return position
        },
        scrollStep,
        scrollDelay
    )
    return lastPosition
}