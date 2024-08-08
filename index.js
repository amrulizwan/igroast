const express = require('express');

const axios = require('axios');

const { CookieJar } = require('tough-cookie');

const cheerio = require('cheerio');

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const { RateLimiterMemory } = require('rate-limiter-flexible');

const cors = require('cors');

require('dotenv').config();



const app = express();

const port = process.env.PORT || 3000;



const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);



const rateLimiter = new RateLimiterMemory({

  points: 5,

  duration: 720,

});



app.use(express.json(), cors());



app.get('/api/instagram-profile', async (req, res) => {

  const username = req.query.username;



  if (!username) {

    return res.status(400).json({ message: 'Username is required' });

  }



  try {

    const profile = await getInstagramProfile(username);

    return res.json(profile);

  } catch (error) {

    console.error('Error fetching Instagram profile:', error);

    return res.status(500).json({ message: 'Error fetching Instagram profile' });

  }

});



async function getInstagramProfile(username) {

  const profileUrl = `https://www.instagram.com/${username}/`;

  const jar = new CookieJar();

  jar.setCookieSync(`sessionid=${process.env.INSTAGRAM_SESSION_ID}`, profileUrl);



  try {


    const response = await axios.get(profileUrl, {

      headers: {

        'Cookie': jar.getCookieStringSync(profileUrl),

      },

      withCredentials: true

    });



    const $ = cheerio.load(response.data);



    const profile = {};



    const titleMeta = $('meta[property="og:title"]').attr('content');

    if (titleMeta) {

      const titleEnd = titleMeta.indexOf('•');

      profile.title = titleEnd !== -1 ? titleMeta.slice(0, titleEnd).trim() : '';

    }



    const bioMeta = $('meta[name="description"]').attr('content');

    if (bioMeta) {

      const bioMatch = bioMeta.match(/"([^"]+)"/);

      profile.bio = bioMatch ? bioMatch[1] : '';



      const statsEnd = bioMeta.indexOf('-');

      if (statsEnd !== -1) {

        const statsStr = bioMeta.slice(0, statsEnd).trim();

        const stats = parseFollowers(statsStr);

        Object.assign(profile, stats);

      }

    }



    return profile;

  } catch (error) {

    console.error('Error fetching Instagram profile:', error);

    throw new Error('Error fetching Instagram profile');

  }

}



function parseFollowers(input) {

  const parts = input.split(', ');

  if (parts.length !== 3) {

    throw new Error('Input string does not have exactly 3 parts');

  }



  return {

    followers: parseNumber(parts[0]),

    following: parseNumber(parts[1]),

    posts: parseNumber(parts[2]),

  };

}



function parseNumber(part) {

  const numberStr = part.split(' ')[0].replace(',', '');

  if (numberStr.endsWith('K')) {

    return Math.round(parseFloat(numberStr.slice(0, -1)) * 1000);

  }

  return parseInt(numberStr, 10);

}



app.get('/api/roasting', async (req, res) => {

  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (clientIp) {

    try {

      await rateLimiter.consume(clientIp);

    } catch (error) {

      return res.status(429).json({ message: 'Terlalu banyak permintaan, coba lagi nanti.' });

    }

  } else {

    return res.status(400).json({ message: 'IP klien tidak valid.' });

  }



  const username = req.query.username;

  if (!username) {

    return res.status(400).json({ message: 'Username diperlukan' });

  }



  try {

    const profile = await getInstagramProfile(username);

    let prompt = `Berikan roasting singkat, kejam, dan menyindir,personal,menyakitkan hingga frustasi dalam bahasa gaul 2 paragraf untuk profil Instagram berikut: ${username}. Berikut detailnya: "${JSON.stringify(profile)}"`;



    if (profile.bio && /[^\u0000-\u007F]/.test(profile.bio)) {

      prompt += `. (Berikan response dalam bahasa Indonesia dan jangan berikan pujian tapi berikan saran dalam kata-kata kejam)`;

    }



    const safetySettings = [

      {

        category: HarmCategory.HARM_CATEGORY_HARASSMENT,

        threshold: HarmBlockThreshold.BLOCK_NONE,

      },

      {

        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,

        threshold: HarmBlockThreshold.BLOCK_NONE,

      },

    ];



    const model = genAI.getGenerativeModel({

      model: 'gemini-1.5-flash',

      safetySettings,

    });



    const result = await model.generateContent(prompt);

    const response = await result.response.text();

    return res.json({ roasting: response });

  } catch (error) {

    console.error('Error generating roast:', error);

    return res.status(500).json({ message: 'Terjadi kesalahan saat menghasilkan roasting' });

  }

});



app.listen(port, () => {

  console.log(`Server is running on http://localhost:${port}`);

});

