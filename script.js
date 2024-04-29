const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// URL du webhook Discord pour les notifications de RAP
const rapWebhookUrl = 'https://discord.com/api/webhooks/1233794276341841970/kMrMsgFOziZIqLqllLk_hgJe5yjMWO67IPagQL5Eja7Zwt_Xexes-_JuqXy95TSaF-RZ';

// URL de l'API pour récupérer les données de la guerre de clan active
const clanBattleAPI = 'https://biggamesapi.io/api/activeClanBattle';

// URL de l'API pour récupérer les données de RAP
const rapAPI = 'https://biggamesapi.io/api/rap';

// Variable pour stocker les contributions en diamants des 2 dernières minutes
let last2MinutesContributions = {};

// Variable pour stocker les données de RAP précédentes
let previousRAPData = {};

// Fonction pour récupérer les informations depuis l'API
async function fetchClanInfo(endpoint) {
    try {
        const response = await axios.get(`https://biggamesapi.io/api${endpoint}`);
        return response.data;
    } catch (error) {
        console.error('Erreur :', error.message);
        return null; // Retourne null en cas d'erreur
    }
}

// Fonction pour récupérer le nom d'utilisateur à partir de l'URL du profil Roblox
async function getUsername(profileUrl) {
    try {
        const response = await axios.get(profileUrl);
        const $ = cheerio.load(response.data);
        const username = $('meta[name="twitter:title"]').attr('content').replace(' (@Roblox)', '');
        return username.trim();
    } catch (error) {
        console.error('Erreur lors de la récupération du nom du joueur :', error.message);
        return null; // Retourne null en cas d'erreur
    }
}

// Fonction pour envoyer une notification à Discord via un webhook
async function sendDiscordNotification(content) {
    try {
        await axios.post(rapWebhookUrl, { content });
        console.log('Notification Discord envoyée avec succès :', content);
    } catch (error) {
        console.error('Erreur lors de l\'envoi de la notification Discord :', error.message);
    }
}

// Fonction pour sauvegarder les contributions en diamants dans le fichier "diamondContributions.json"
function saveDiamondContributions(diamondContributions) {
    try {
        fs.writeFileSync('diamondContributions.json', JSON.stringify(diamondContributions));
        console.log('Contribution en diamants sauvegardées avec succès.');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des contributions en diamants :', error.message);
    }
}

// Fonction pour charger les contributions en diamants depuis le fichier "diamondContributions.json"
function loadDiamondContributions() {
    try {
        if (fs.existsSync('diamondContributions.json')) {
            const data = fs.readFileSync('diamondContributions.json', 'utf8');
            return JSON.parse(data);
        } else {
            return {};
        }
    } catch (error) {
        console.error('Erreur lors du chargement des contributions en diamants :', error.message);
        return {};
    }
}

// Fonction pour comparer les données de RAP actuelles avec les données précédentes
async function compareRAP(currentRAPData) {
    if (Object.keys(previousRAPData).length !== 0) {
        const rapDifferences = [];

        for (const itemId in currentRAPData) {
            if (currentRAPData.hasOwnProperty(itemId) && previousRAPData.hasOwnProperty(itemId)) {
                const previousRAP = previousRAPData[itemId];
                const currentRAP = currentRAPData[itemId];

                const rapChange = currentRAP - previousRAP;
                const rapChangePercentage = ((rapChange / previousRAP) * 100).toFixed(2);

                if (Math.abs(rapChangePercentage) >= 100) {
                    rapDifferences.push({ itemId, rapChange, rapChangePercentage });
                }
            }
        }

        if (rapDifferences.length > 0) {
            rapDifferences.sort((a, b) => Math.abs(b.rapChangePercentage) - Math.abs(a.rapChangePercentage));

            const embedContent = {
                embeds: [{
                    title: 'Évolutions de RAP importantes',
                    color: 0xFF0000,
                    fields: rapDifferences.map(diff => ({
                        name: `${diff.itemId} (${diff.rapChangePercentage > 0 ? 'Augmentation' : 'Diminution'})`,
                        value: `Variation : ${diff.rapChangePercentage}%`
                    }))
                }]
            };

            await sendDiscordNotification(embedContent);
        }
    }

    previousRAPData = currentRAPData;
}

// Fonction pour récupérer les données de RAP
async function getRAPData() {
    try {
        const response = await axios.get(rapAPI);
        const rapData = response.data;
        return rapData;
    } catch (error) {
        console.error('Erreur lors de la récupération des données de RAP :', error.message);
        return null;
    }
}

// Fonction pour vérifier les nouvelles contributions en diamants et envoyer une notification Discord si une contribution est détectée
async function checkDiamondContributions(endpoint, clanInfo) {
    const currentTime = Math.floor(Date.now() / 1000); // Temps actuel en secondes

    if (clanInfo && clanInfo.data && clanInfo.data.DiamondContributions) {
        const diamondContributionsData = clanInfo.data.DiamondContributions.AllTime.Data;

        for (const contribution of diamondContributionsData) {
            const userId = contribution.UserID;
            const diamonds = contribution.Diamonds;

            if (!last2MinutesContributions[userId]) {
                last2MinutesContributions[userId] = {
                    diamonds,
                    lastCheck: currentTime
                };
            } else {
                if (currentTime - last2MinutesContributions[userId].lastCheck >= 120) {
                    delete last2MinutesContributions[userId];
                } else {
                    // Comparaison des contributions
                    if (last2MinutesContributions[userId].diamonds !== diamonds) {
                        const username = await getUsername(`https://www.roblox.com/users/${userId}/profile`);
                        if (username !== null && diamonds > 0) { // Vérification si diamonds est supérieur à 0
                            const diamondsGiven = diamonds - last2MinutesContributions[userId].diamonds;
                            const message = `🎁 ${username} + ${diamondsGiven} diamants lors de la dernière contribution ! 🎉`;
                            await sendDiscordNotification(message);
                        }
                        // Mise à jour de la contribution avec le nouveau montant et l'heure actuelle
                        last2MinutesContributions[userId].diamonds = diamonds;
                        last2MinutesContributions[userId].lastCheck = currentTime;
                    }
                }
            }
        }
    }

    // Sauvegarde des contributions en diamants
    saveDiamondContributions(last2MinutesContributions);
}

// Fonction pour afficher les informations du clan
async function displayClanInfo(endpoint, clanInfo) {
    if (endpoint === '/clan/MEWT') {
        console.log(`Clan : ${clanInfo.data.Name}`);
        console.log('Date de création : 04/12/2023 21:53:35');
        console.log(`Nombre de membres : ${clanInfo.data.Members.length + 1}`);
        console.log(`Nombre d'officiers : ${clanInfo.data.OfficerCapacity - 1}`);
        console.log(`Capacité du clan : ${clanInfo.data.MemberCapacity}`);
        console.log(`Niveau du clan : ${clanInfo.data.GuildLevel}`);
        console.log(`Description : ${clanInfo.data.Desc}`);
        console.log('Noms des membres :');

        for (const member of clanInfo.data.Members) {
            const username = await getUsername(`https://www.roblox.com/users/${member.UserID}/profile`);
            if (username !== null) {
                const cleanUsername = username.replace('\'s Profile', '');
                console.log(`${cleanUsername}`);
            } else {
                console.log(`Nom inconnu`);
            }
        }
    } else {
        console.log(`Informations de ${endpoint} :`, clanInfo);
    }
}

// Fonction pour récupérer les données de la guerre de clan active
async function getActiveClanBattle() {
    try {
        const response = await axios.get(clanBattleAPI);
        return response.data;
    } catch (error) {
        console.error('Erreur lors de la récupération des données de la guerre de clan active :', error.message);
        return null;
    }
}

// Fonction pour vérifier si la guerre de clan est active
function isClanBattleActive(clanBattleData) {
    if (clanBattleData && clanBattleData.data && clanBattleData.data.configData) {
        const currentTime = Math.floor(Date.now() / 1000); // Temps actuel en secondes
        const startTime = clanBattleData.data.configData.StartTime;
        const finishTime = clanBattleData.data.configData.FinishTime;
        return currentTime >= startTime && currentTime <= finishTime;
    }
    return false;
}

// Fonction pour récupérer les quêtes disponibles
function getAvailableQuests(clanBattleData) {
    const quests = [];
    if (clanBattleData && clanBattleData.data && clanBattleData.data.configData && clanBattleData.data.configData.Rewards) {
        const rewards = clanBattleData.data.configData.Rewards;
        for (const level in rewards) {
            if (rewards.hasOwnProperty(level)) {
                rewards[level].forEach(reward => {
                    // Vérifier si la récompense est une quête
                    if (reward._data.id === 'Quête') {
                        quests.push(reward._data.name); // Ajouter le nom de la quête à la liste
                    }
                });
            }
        }
    }
    return quests;
}

// Fonction pour interroger les différents endpoints de l'API
async function pollClanInfo() {
    const endpoints = [
        '/clan/MEWT',
    ];

    for (const endpoint of endpoints) {
        const clanInfo = await fetchClanInfo(endpoint);
        if (clanInfo !== null) {
            displayClanInfo(endpoint, clanInfo);
            await checkDiamondContributions(endpoint, clanInfo);
        }
    }

    // Récupérer les données de la guerre de clan active
    const clanBattleData = await getActiveClanBattle();
    if (clanBattleData) {
        // Vérifier si la guerre de clan est active
        const isActive = isClanBattleActive(clanBattleData);
        if (isActive) {
            console.log('La guerre de clan est active !');

            // Récupérer les quêtes disponibles
            const quests = getAvailableQuests(clanBattleData);
            if (quests.length > 0) {
                console.log('Quêtes disponibles :');
                quests.forEach(quest => {
                    console.log('-', quest);
                });
            } else {
                console.log('Aucune quête disponible pour le moment.');
            }
        } else {
            console.log('La guerre de clan n\'est pas active pour le moment.');
        }
    }

    // Récupérer les données de RAP et comparer les évolutions
    const currentRAPData = await getRAPData();
    if (currentRAPData) {
        await compareRAP(currentRAPData);
    }

    // Appel récursif pour interroger les endpoints toutes les 30 secondes
    setTimeout(pollClanInfo, 30000);
}

// Initialisation des contributions en diamants
last2MinutesContributions = loadDiamondContributions();

// Lancement de la première requête
pollClanInfo();
