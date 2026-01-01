const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const puppeteer = require("puppeteer");
const port = process.env.PORT || 9000;

const app = express();

app.use(cors());

app.get("/tr", (request, res) => {
    const requestQuery = request.query;
    const ev = requestQuery?.ev;
    const icon = requestQuery?.icon;
    const platform = requestQuery?.platform;

    /* const MySQLConnection = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: ""
    })
    
    MySQLConnection.connect((err) => {
        if (err) throw err;
        console.log("Connected!");
    
        MySQLConnection.query("CREATE DATABASE analytics_insights", (err, results) => {
            if (err) throw err;
            console.log("Database created!");
        })
    }) */

    res.json({ev: ev, icon: icon, platform: platform })
});

app.get("/cookie-audit", async (req, res) => {
    const domain = req.query.domain;
    if (!domain) {
        return res.status(400).json({ error: "Missing domain query parameter" });
    }
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(`https://${domain}`, { waitUntil: "networkidle2", timeout: 30000 });
        const cookies = await page.cookies();
        await browser.close();
        res.json({ domain, cookies });
    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ error: err.message });
    }
});

app.get("/", (request, res) => {
    res.send("Hello from Intastellar Analytics Server");
});

app.listen(port, () => {
    console.log(`Listen on port ${port}`);
})