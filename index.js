const puppeteer = require('puppeteer-extra');
const stealthPlugin = require("puppeteer-extra-plugin-stealth")();
const inquirer = require("inquirer");
const chalk = require("chalk");
const {resolve} = require("path");
const fetch = require("node-fetch");
const fs = require("fs");
const {Headers} = require('node-fetch');
const UserAgent = require('user-agents');
const https = require("https");

//set a user-agent for fetch & pptr
const headers = new Headers();
const userAgent = new UserAgent({platform: 'Win32'}).toString();
headers.append('User-Agent', 'TikTok 27.6.3 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet');
const headersWm = new Headers();
headersWm.append('User-Agent', userAgent);
["chrome.runtime", "navigator.languages"].forEach(a =>
    stealthPlugin.enabledEvasions.delete(a)
);
puppeteer.use(stealthPlugin);

const getChoice = () => new Promise((resolve, reject) => {
    inquirer.prompt([
        {
            type: "list",
            name: "choice",
            message: "Choose a option",
            choices: ["Mass Download (Username)", "Mass Download (URL)", "Single Download (URL)"]
        },
        {
            type: "list",
            name: "type",
            message: "Choose a option",
            choices: ["With Watermark", "Without Watermark"]
        }
    ])
        .then(res => resolve(res))
        .catch(err => reject(err));
});

const getInput = (message) => new Promise((resolve, reject) => {
    inquirer.prompt([
        {
            type: "input",
            name: "input",
            message: message
        }
    ])
        .then(res => resolve(res))
        .catch(err => reject(err));
});

const generateUrlProfile = (username) => {
    let baseUrl = "https://www.tiktok.com/";
    if (username.includes("@")) {
        baseUrl = `${baseUrl}${username}`;
    } else {
        baseUrl = `${baseUrl}@${username}`;
    }
    return baseUrl;

};

const downloadMediaFromList = async (list) => {
    const folder = "downloads/"
    try {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder)
        }
    } catch (err) {
        console.error(err)
    }
    list.forEach((item) => {
        const fileName = `${item.id}.mp4`
        const file = fs.createWriteStream(folder + fileName)

        console.log(chalk.green(`[+] Downloading ${fileName}`))
        https.get(item.url, async response => {
            response.pipe(file)
            file.on("finish", () => {
                console.log(chalk.green('[+] Download completed'))
                file.close();
            });
            file.on("error", () => {
                console.log(chalk.red('[-] Download uncompleted'))
                file.close();
            });
            resolve(folder + fileName);
        });
    });
}


const getVideoWM = async (url) => {
    const idVideo = getIdVideo(url)
    const request = await fetch(url, {
        method: "GET",
        headers: headersWm
    });
    const res = await request.text()
    const urlMedia = res.toString().match(/\{"url":"[^"]*"/g).toString().split('"')[3].replace(/\\u002F/g, "/");

    return {
        url: urlMedia,
        id: idVideo
    };
}

const getVideoNoWM = async (url) => {
    const idVideo = getIdVideo(url)
    const API_URL = `https://api19-core-useast5.us.tiktokv.com/aweme/v1/feed/?aweme_id=${idVideo}&version_code=272&app_name=musical_ly&channel=App&device_id=null&os_version=14.4.2&device_platform=iphone&device_type=iPhone9`;
    const request = await fetch(API_URL, {
        method: "GET",
        headers: headers
    });

    try {
        const body = await request.text();
        let res = JSON.parse(body);
        const urlMedia = res.aweme_list[0].video.play_addr.url_list[0]
        console.log(chalk.yellow(`[*] find video ${idVideo}`))
        return {
            url: urlMedia,
            id: idVideo
        }
    } catch (err) {
        console.error("Error:", err);
        console.error("Response body:", body);
    }

}

const getListVideoByUsername = async (username) => {


    let baseUrl = generateUrlProfile(username);
    if (baseUrl.includes("tiktok.com/http")) {
        baseUrl = baseUrl.slice(23)
    }

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: require("puppeteer").executablePath(),
        args: ["--no-sandbox"]

    })
    const page = await browser.newPage()


    await page.setRequestInterception(true);

    page.on('request', (request) => {
        if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
            request.abort();
        } else {
            request.continue();
        }
    })
    await page.setUserAgent(userAgent);
    await page.goto(baseUrl)
    let listVideo = []
    console.log(chalk.green("[*] Getting list video from: " + username))
    let loop = true
    let lastVideoCount = 0
    while (loop) {
        listVideo = await page.evaluate(() => {
            const listVideo = Array.from(document.querySelectorAll(".tiktok-yz6ijl-DivWrapper > a"));
            return listVideo.map(item => item.href);
        });
        await pagescroll(page)
        console.log(chalk.green(`[*] Total video found: ${listVideo.length}`))
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (lastVideoCount === listVideo.length) {
            loop = false
        }
        lastVideoCount = listVideo.length
    }
    await browser.close()
    return listVideo
}
const pagescroll = async (page) => {
    await page.evaluate(() => new Promise((resolve) => {
        let scrollTop = -1;
        const interval = setInterval(() => {
            window.scrollBy(0, 1000);
            if (document.documentElement.scrollTop !== scrollTop) {
                scrollTop = document.documentElement.scrollTop;
                return;
            }
            clearInterval(interval);
            resolve();
        }, 100);
    }));
}

const getRedirectUrl = async (url) => {
    if (url.includes("vm.tiktok.com") || url.includes("vt.tiktok.com")) {
        url = await fetch(url, {
            redirect: "follow",
            follow: 10,
        });
        url = url.url;
        console.log(chalk.green("[*] Redirecting to: " + url));
    }
    return url;
}

const getIdVideo = (url) => {
    const matching = url.includes("/video/")
    if (!matching) {
        console.log(chalk.red("[X] Error: URL not found"));
        return
    }
    const idVideo = url.substring(url.indexOf("/video/") + 7, url.length);
    return (idVideo.length > 19) ? idVideo.substring(0, idVideo.indexOf("?")) : idVideo;
}

// Mainfunction
(async () => {
    const header = "\rBotProject by https://github.com/Rainman1980X/botproject \n"
    console.log(chalk.magenta(header))
    const choice = await getChoice();
    const selection = choice.choice;
    let listVideo = [];
    let listMedia = [];


    if (selection === "Mass Download (Username)") {
        const usernameInput = await getInput("Enter the username with @ (e.g. @username) : ");
        const username = usernameInput.input;
        listVideo = await getListVideoByUsername(username);
        if (listVideo.length === 0) {
            console.log(chalk.yellow("[!] Error: No video found"));
            process.exit();
        }
    } else if (selection === "Mass Download (URL)") {
        let urls = [];
        const count = await getInput("Enter the number of URL : ");
        for (let i = 0; i < count.input; i++) {
            const urlInput = await getInput("Enter the URL : ");
            urls.push(urlInput.input);
        }

        for (let i = 0; i < urls.length; i++) {
            const url = await getRedirectUrl(urls[i]);
            const idVideo = getIdVideo(url);
            listVideo.push(idVideo);
        }
    } else {
        const urlInput = await getInput("Enter the URL : ");
        const url = await getRedirectUrl(urlInput.input);
        listVideo.push(url);
    }

    console.log(chalk.green(`[!] Found ${listVideo.length} video`));


    for (let i = 0; i < listVideo.length; i++) {
        let data = (choice.type === "With Watermark") ? await getVideoWM(listVideo[i]) : await getVideoNoWM(listVideo[i]);
        listMedia.push(data);
    }

    downloadMediaFromList(listMedia)
        .then(() => {
            console.log(chalk.green("[+] Downloaded successfully"));
        })
        .catch(err => {
            console.log(chalk.red("[X] Error: " + err));
        });


})();
