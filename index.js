import express from 'express';
import cors from 'cors';
import pokemon from './schema/pokemon.js';
import './connect.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir les fichiers images
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Configuration Multer pour l'upload d'images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'assets/pokemons');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `temp_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

app.get('/', (req, res) => res.send('API Pokémon Ready!'));

// GET tous les Pokémons avec pagination
app.get('/pokemons', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const pokemons = await pokemon.find({}).skip(skip).limit(limit);
        const total = await pokemon.countDocuments();

        res.json({
            page,
            totalPages: Math.ceil(total / limit),
            data: pokemons
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET Pokémon par recherche de nom (français uniquement)
app.get('/pokemons/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query.trim()) {
            return res.json([]);
        }

        const pokemons = await pokemon.find({
            'name.french': { $regex: query, $options: 'i' }
        });

        res.json(pokemons);
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET Pokémon par ID
app.get('/pokemons/:id', async (req, res) => {
    try {
        const pokeId = parseInt(req.params.id, 10);
        const poke = await pokemon.findOne({ id: pokeId });
        poke ? res.json(poke) : res.status(404).json({ error: 'Non trouvé' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST créer un Pokémon
app.post('/pokemons', upload.single('image'), async (req, res) => {
    try {
        let raw = req.body;
        const newPokemonData = {
            id: null,
            name: {
                french: raw['name.french'] || raw.name?.french || raw.name
            },
            type: typeof raw.type === 'string' ? raw.type.split(',').map(t=>t.trim()) : raw.type || [],
            base: {
                HP: parseInt(raw['base.HP'] || 0),
                Attack: parseInt(raw['base.Attack'] || 0),
                Defense: parseInt(raw['base.Defense'] || 0),
                SpecialAttack: parseInt(raw['base.SpecialAttack'] || 0),
                SpecialDefense: parseInt(raw['base.SpecialDefense'] || 0),
                Speed: parseInt(raw['base.Speed'] || 0),
            }
        };

        // Auto-increment ID
        const lastPokemon = await pokemon.findOne().sort({ id: -1 });
        newPokemonData.id = lastPokemon ? lastPokemon.id + 1 : 1;

        // Gérer l'image
        if (req.file) {
            const extension = path.extname(req.file.originalname);
            const finalName = `${newPokemonData.id}${extension}`;
            const finalPath = path.join(__dirname, 'assets/pokemons', finalName);
            fs.renameSync(req.file.path, finalPath);
            newPokemonData.image = `http://localhost:3000/assets/pokemons/${finalName}`;
        } else {
            newPokemonData.image = 'http://localhost:3000/assets/pokemons/default.png';
        }

        const newPokemon = new pokemon(newPokemonData);
        const savedPokemon = await newPokemon.save();
        res.status(201).json(savedPokemon);
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: error.message });
    }
});

// DELETE un Pokémon et son image
app.delete('/pokemons/:id', async (req, res) => {
    try {
        const pokeId = parseInt(req.params.id, 10);
        const p = await pokemon.findOne({ id: pokeId });

        if (!p) return res.status(404).json({ error: 'Introuvable' });

        // Supprimer le fichier image si local
        if (p.image && p.image.includes('/assets/pokemons/')) {
            const filename = p.image.split('/assets/pokemons/')[1];
            const filePath = path.join(__dirname, 'assets/pokemons', filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        await pokemon.findOneAndDelete({ id: pokeId });
        res.json({ message: 'Supprimé avec succès' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT modifier un Pokémon
app.put('/pokemons/:id', upload.single('image'), async (req, res) => {
    try {
        const pokeId = parseInt(req.params.id, 10);
        let raw = req.body;
        let updates = {};

        if (raw['name.french']) updates['name.french'] = raw['name.french'];
        if (raw['base.HP']) updates['base.HP'] = parseInt(raw['base.HP']);
        if (raw['base.Attack']) updates['base.Attack'] = parseInt(raw['base.Attack']);
        if (raw['base.Defense']) updates['base.Defense'] = parseInt(raw['base.Defense']);
        if (raw['base.SpecialAttack']) updates['base.SpecialAttack'] = parseInt(raw['base.SpecialAttack']);
        if (raw['base.SpecialDefense']) updates['base.SpecialDefense'] = parseInt(raw['base.SpecialDefense']);
        if (raw['base.Speed']) updates['base.Speed'] = parseInt(raw['base.Speed']);
        
        if (raw.type) {
            updates.type = typeof raw.type === 'string' 
                ? raw.type.split(',').map(t => t.trim())
                : raw.type;
        }

        if (req.file) {
            const extension = path.extname(req.file.originalname);
            const finalName = `${pokeId}${extension}`;
            const finalPath = path.join(__dirname, 'assets/pokemons', finalName);
            fs.renameSync(req.file.path, finalPath);
            updates.image = `http://localhost:3000/assets/pokemons/${finalName}`;
        }

        const updated = await pokemon.findOneAndUpdate({ id: pokeId }, { $set: updates }, { new: true });
        updated ? res.json(updated) : res.status(404).json({ error: 'Introuvable' });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});