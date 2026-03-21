const admin = require('firebase-admin');

// Inicializa o Firebase Admin usando variáveis de ambiente do Vercel
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Trata as quebras de linha obrigatórias na chave privada
                privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
            })
        });
    } catch (error) {
        console.error('Erro na inicialização do Firebase Admin:', error.stack);
    }
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método não permitido. Use POST.' });
    }

    try {
        // O Hottok (Token de Segurança da Hotmart)
        const hottokConfigurado = process.env.HOTMART_HOTTOK;
        // A Hotmart envia `hot-tok` no cabeçalho ou como parâmetro hottok em versões antigas
        const hottokRecebido = req.headers['x-hotmart-hottok'] || req.query.hottok;
        
        if (!hottokConfigurado) {
             console.error("Variável HOTMART_HOTTOK ausente no Vercel.");
             return res.status(500).json({ error: 'Configuração do Servidor Incompleta' });
        }

        if (hottokRecebido !== hottokConfigurado) {
             console.error("Tentativa de fraude! Hottok inválido.");
             return res.status(401).json({ error: 'Não Autorizado: Hottok Inválido' });
        }

        const data = req.body;
        const eventType = data.event; 
        
        // Pegando e-mail do comprador de acordo com o padrão Webhook v2.0 da Hotmart
        let buyerEmail = '';
        if (data.data && data.data.buyer && data.data.buyer.email) {
            buyerEmail = data.data.buyer.email.toLowerCase().trim();
        }

        if (!buyerEmail) {
            return res.status(400).json({ error: 'Email do comprador não encontrado no payload' });
        }

        // Eventos que concedem acesso
        const eventsToActivate = ['PURCHASE_APPROVED', 'PURCHASE_COMPLETED']; 
        
        // Eventos que removem acesso
        const eventsToSuspend = ['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'SUBSCRIPTION_CANCELED', 'SUBSCRIPTION_BILING_ISSUE'];
        
        if (eventsToActivate.includes(eventType)) {
            await db.collection('access_list').doc(buyerEmail).set({
                status: 'active',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log(`[Hotmart] Acesso ATIVADO para: ${buyerEmail}`);
            
        } else if (eventsToSuspend.includes(eventType)) {
            await db.collection('access_list').doc(buyerEmail).set({
                status: 'inactive',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log(`[Hotmart] Acesso SUSPENSO para: ${buyerEmail}`);
        }

        return res.status(200).json({ success: true, message: 'Processado com sucesso' });

    } catch (error) {
        console.error("Erro interno no processamento:", error);
        return res.status(500).json({ error: 'Erro Servidor Backend' });
    }
}
