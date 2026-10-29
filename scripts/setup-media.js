/* Explicit setup for npm versions that block dependency install scripts. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const binary=require('ffmpeg-static');
if(!binary){console.error('Não há conversor empacotado para este sistema. Instale o FFmpeg no servidor e disponibilize-o no PATH.');process.exitCode=1;}
else if(fs.existsSync(binary))console.log('Conversor de imagens e vídeos já instalado.');
else{const cache=path.join(os.tmpdir(),'inova-media-cache');fs.mkdirSync(cache,{recursive:true});console.log('Instalando o conversor de mídia para este sistema…');const result=spawnSync(process.execPath,[require.resolve('ffmpeg-static/install.js')],{stdio:'inherit',windowsHide:true,env:{...process.env,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME||cache}});if(result.status!==0||!fs.existsSync(binary)){console.error('Não foi possível instalar o conversor. Confira a conexão de internet e execute npm run media:setup novamente.');process.exitCode=1;}else console.log('Conversor instalado. Execute npm start.');}
