// Script pour générer les icônes PWA à partir du SVG
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const svgPath = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Créer un SVG avec l'emoji rendu correctement
const createIconSvg = (size) => {
  // Fond coloré avec l'emoji centré
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#D4A574"/>
          <stop offset="100%" style="stop-color:#C19A6B"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.167)}" fill="url(#bg)"/>
      <text 
        x="${size / 2}" 
        y="${size * 0.68}" 
        font-size="${Math.round(size * 0.52)}" 
        text-anchor="middle"
      >🥖</text>
    </svg>
  `;
};

async function generateIcons() {
  console.log('🎨 Génération des icônes PWA...\n');
  
  // Créer le dossier s'il n'existe pas
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const size of sizes) {
    const svgContent = createIconSvg(size);
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
    
    try {
      // Convertir le SVG en PNG
      const buffer = await sharp(Buffer.from(svgContent))
        .resize(size, size)
        .png()
        .toBuffer();
      
      // Sauvegarder le fichier
      await sharp(buffer)
        .toFile(outputPath);
      
      console.log(`✅ icon-${size}x${size}.png généré`);
    } catch (error) {
      console.error(`❌ Erreur pour ${size}x${size}:`, error.message);
    }
  }

  // Générer aussi un favicon.ico (multiple sizes)
  try {
    const favicon16 = await sharp(Buffer.from(createIconSvg(16)))
      .resize(16, 16)
      .png()
      .toBuffer();
    
    const favicon32 = await sharp(Buffer.from(createIconSvg(32)))
      .resize(32, 32)
      .png()
      .toBuffer();
    
    // Créer favicon.ico (format PNG pour simplicité)
    await sharp(favicon32)
      .toFile(path.join(outputDir, 'favicon.ico'));
    
    console.log('\n✅ favicon.ico généré');
  } catch (error) {
    console.error('❌ Erreur favicon:', error.message);
  }

  // Générer apple-touch-icon.png (180x180)
  try {
    const appleSvg = createIconSvg(180);
    await sharp(Buffer.from(appleSvg))
      .resize(180, 180)
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));
    console.log('✅ apple-touch-icon.png généré (180x180)');
  } catch (error) {
    console.error('❌ Erreur apple-touch-icon:', error.message);
  }

  console.log('\n🎉 Génération terminée !');
}

generateIcons().catch(console.error);