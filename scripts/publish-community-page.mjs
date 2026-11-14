// Publish the reviewed frontend only. The API, bot, nginx and private data are untouched.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {nginxRoots,publishStatic} from './repair-community-promo-static.mjs'
import {staticAccessPlan} from './lib/site-static-access.mjs'
import {currentBundle} from './lib/site-bundle.mjs'

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const run=(name,args)=>spawnSync(name,args,{encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024})
const write=(file,bytes,mode=0o644)=>{
  const temp=file+'.community-'+crypto.randomBytes(5).toString('hex')
  try{fs.writeFileSync(temp,bytes,{mode,flag:'wx'});fs.chmodSync(temp,mode);fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
}

export function restoreStatic(root,backup) {
  const manifest=path.join(backup,'manifest.json')
  if(!fs.existsSync(manifest))return 0 // publishStatic writes its manifest before any public file.
  const files=JSON.parse(fs.readFileSync(manifest,'utf8')).filter(item=>item.existed).sort((a,b)=>(b.path==='index.html')-(a.path==='index.html'))
  const modes=JSON.parse(fs.readFileSync(path.join(backup,'previous-modes.json'),'utf8'))
  let restored=0
  for(const item of files){
    if(path.isAbsolute(item.path)||item.path.split(path.sep).includes('..'))throw Error('Некорректный путь резервной копии')
    const file=path.join(root,item.path),previous=fs.readFileSync(path.join(backup,item.path))
    const actualParent=fs.realpathSync(path.dirname(file))
    if(actualParent!==root&&!actualParent.startsWith(root+path.sep)||fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Путь изменился во время публикации')
    const current=fs.existsSync(file)?fs.readFileSync(file):null
    if(current?.equals(previous))continue
    if(current&&hash(current)!==item.sha256)throw Error('Файл изменён другим процессом: '+item.path)
    write(file,previous,modes[item.path]??0o644);restored++
  }
  // New hashed assets remain available to browsers that briefly received the new index.
  return restored
}

async function main(){
  process.umask(0o077)
  if(process.getuid?.()!==0)throw Error('Запустите от root на сервере сайта')
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]}
  const source=staticAccessPlan(option('--dist')||path.join(import.meta.dirname,'../dist')),bundle=currentBundle(source)
  if(bundle.missing.length||Object.values(bundle.forms).some(forms=>forms.length!==1)||!bundle.promo)throw Error('Сборка не подтвердила текущие формы и промокод')
  const canonical=value=>value.replace(/ё/g,'е').replace(/Ё/g,'Е')
  const text=canonical(bundle.assets.filter(asset=>asset.endsWith('.js')).map(asset=>fs.readFileSync(path.join(source.root,asset),'utf8')).join('\n'))
  for(const required of ["Сообщество карьерного юриста","Без подписки","С подпиской","Закрытый чат в Телеграме","Нетворкинг","Закрытые мероприятия с приглашенными экспертами юридического рынка","Мастермайнды и карьерные разборы","Онлайн- и офлайн-встречи резидентов","База знаний","Закрытые вакансии и стажировки","Одна бесплатная карьерная консультация в месяц","Спикерство на мероприятиях и подкастах","Скидки от 20 до 50 процентов на мероприятия","Специальные предложения и скидки от партнеров","Барбусова","Александра","Третьякова","Валерия","Канду","Ангелина","Романова","Алена","Доманова","Батчина","Шеловская","Гранкина","Дюскина","Аверьянова","География сообщества","Предыдущие амбассадоры","Следующие амбассадоры","Лента циклическая.","3-я группа рейтинга","Юридический бизнес России","Рейтинг юридических Telegram-каналов · 2025","Индекс качества — 12 место","Стать амбассадором","Почему вы хотите стать резидентом?"])if(!text.includes(canonical(required)))throw Error('Не найдено изменение новой версии: '+required)
  for(const required of ['Наши достижения','Частые вопросы','Как понять, подхожу ли я?','С какого момента открывается моё резидентство в сообществе?','Можно ли сделать возврат?','Входят ли мероприятия в стоимость подписки?','Есть ли заморозка?','Я не из Петербурга или Москвы — стоит ли мне стать резидентом?','Какие есть возможности в сообществе?','Для чего вступать в сообщество?','Как стать резидентом?','Какая аудитория в сообществе?','Я не нашёл ответ на свой вопрос. Как мне с вами связаться?','Здесь будет ответ на этот вопрос.','Предыдущие отзывы','Следующие отзывы','Читать полностью','Карточка амбассадора'])if(!text.includes(canonical(required)))throw Error('Не найдено изменение в сборке: '+required)
  const portraits=source.files.filter(file=>/\/(?:alexandra-barbusova|valeria-tretyakova|angelina-kandu)-[^/]+\.png$/.test(file))
  if(portraits.length!==3)throw Error('Не найдены три подготовленных портрета амбассадоров')
  const certificates=source.files.filter(file=>/\/certificate-raso-lbf-2026-[^/]+\.jpg$/.test(file))
  if(certificates.length!==1)throw Error('Не найден оригинал сертификата рейтинга РАСО и Legal Business Forum')
  const originalRecords=JSON.parse(fs.readFileSync(new URL('../src/assets/achievements/originals.json',import.meta.url),'utf8'))
  if(originalRecords.length!==2)throw Error('Не подтверждены два оригинала из архива владельца')
  const archiveOriginals=originalRecords.map(record=>{
    const {name,ext}=path.parse(record.file)
    const matches=source.files.filter(file=>path.basename(file).startsWith(name+'-')&&path.extname(file)===ext)
    if(matches.length!==1)throw Error('Не найден оригинал из архива: '+record.file)
    const bytes=fs.readFileSync(matches[0])
    if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error('Оригинал изменен: '+record.file)
    return matches[0]
  })
  if(run('nginx',['-t']).status!==0)throw Error('nginx -t не прошёл; публикация не начиналась')
  const nginx=run('nginx',['-T']);if(nginx.status!==0)throw Error('Не прочитан действующий nginx')
  const roots=[]
  for(const candidate of nginxRoots(nginx.stdout,'legalcareerist.ru',443))try{const plan=staticAccessPlan(candidate);if(!roots.some(root=>root.root===plan.root))roots.push(plan)}catch{}
  if(roots.length!==1)throw Error('Не определён единственный публичный корень сайта; публикация не начиналась')
  const target=roots[0],origin=new URL('https://legalcareerist.ru'),version=hash(source.html).slice(0,12)
  const get=async(route,options={})=>{
    const url=new URL(route,origin),r=await fetch(url,{...options,signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache',...options.headers}})
    if(!r.ok)throw Error('HTTP '+r.status+' для '+url.pathname)
    return Buffer.from(await r.arrayBuffer())
  }
  const health=async()=>{const data=JSON.parse(await get('/api/health'));if(data.ok!==true)throw Error('API не подтвердил здоровье');return data}
  const pages=async(entry)=>{
    for(const route of ['/','/community','/events','/events/'])if(!(await get(route)).includes(Buffer.from(entry)))throw Error('Сайт отдаёт другую сборку: '+route)
    await health()
  }
  const verify=async()=>{
    await pages(source.entry)
    let next=0;const failures=[]
    await Promise.all(Array.from({length:4},async()=>{
      while(next<bundle.assets.length){const asset=bundle.assets[next++];try{if(!(await get(asset)).equals(fs.readFileSync(path.join(source.root,asset))))failures.push(asset)}catch{failures.push(asset)}}
    }))
    if(failures.length)throw Error('Не совпадают опубликованные JS/CSS: '+failures.slice(0,6).join(', '))
    for(const file of [...portraits,...certificates,...archiveOriginals]){const route='/'+path.relative(source.root,file).split(path.sep).join('/');if(!(await get(route)).equals(fs.readFileSync(file)))throw Error('Не подтверждено изображение: '+route)}
    for(const [tariffId,promoCode,amount,months,subscriptionId]of [['1m','',690,1,'2854597'],['3m','',1770,3,'3005286'],['6m','',3180,6,'3005289'],['1m','KQ1111',350,1,'2611878']]){
      const quote=JSON.parse(await get('/api/community/promo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tariffId,promoCode})}))
      if(quote.ok!==true||quote.applied!==Boolean(promoCode)||quote.amount!==amount||quote.months!==months||String(quote.subscriptionId)!==subscriptionId)throw Error('Не подтверждён расчёт '+(promoCode||tariffId))
    }
  }
  // Verify the actual configured document root before publishing anything.
  await pages(target.entry)
  if(!(await get(target.entry)).equals(fs.readFileSync(path.join(target.root,target.entry))))throw Error('nginx и публичный сайт используют разные сборки; изменений нет')
  if(source.html===target.html){
    try{await verify();console.log('COMMUNITY_PAGE_PUBLISHED: эта версия уже опубликована; повторная запись не нужна. https://legalcareerist.ru/community');return}
    catch{console.log('HTML уже обновлён; проверяю и восстанавливаю файлы текущей сборки.')}
  }
  const base=option('--backup-root')||'/root/legalcareerist-bot-backups'
  fs.mkdirSync(base,{recursive:true,mode:0o700})
  const backup=fs.mkdtempSync(path.join(base,'community-page-20261114-'));fs.chmodSync(backup,0o700)
  const modes={}
  for(const file of source.files){const relative=path.relative(source.root,file),dest=path.join(target.root,relative);if(fs.existsSync(dest))modes[relative]=fs.statSync(dest).mode&0o777}
  fs.writeFileSync(path.join(backup,'previous-modes.json'),JSON.stringify(modes),{mode:0o600})
  fs.writeFileSync(path.join(backup,'release.json'),JSON.stringify({version,commit:option('--commit'),root:target.root,entry:source.entry,previousEntry:target.entry,startedAt:new Date().toISOString(),sourceFiles:['src/pages/community/CommunityHome.tsx','src/assets/ambassadors/','src/assets/achievements/','src/components/AmbassadorCarousel.tsx','src/components/CommunityAchievements.tsx','src/components/CommunityPromoField.tsx','src/components/ConsentCheck.tsx','src/components/HowHeardField.tsx','src/components/TariffJoinBlock.tsx','src/components/FAQSection.tsx','src/components/TestimonialCarousel.tsx','src/index.css','src/lib/featureFlags.ts'],copyNormalization:'visible frontend text: ё → е; URLs and identifiers preserved'},null,2),{mode:0o600})
  try{
    if(fs.readFileSync(path.join(target.root,'index.html'),'utf8')!==target.html)throw Error('Началась другая публикация; операция остановлена')
    console.log('Публикую страницу сообщества; резервная копия: '+backup)
    const changed=publishStatic(source.root,target.root,backup)
    await verify()
    fs.writeFileSync(path.join(backup,'verified.json'),JSON.stringify({verifiedAt:new Date().toISOString(),version,changed,assets:bundle.assets.length,faqQuestions:11,faqColumns:2,comparisonBenefits:11,tariffOrder:['1m','6m','3m'],ambassadorCards:10,namedAmbassadors:10,portraitFiles:3,achievementOriginals:3,archiveOriginals:originalRecords,achievements:3,ambassadorForm:true,ambassadorModal:true,ambassadorCarouselLoop:true,defaultTariff:'6m',geographySidePanel:true,backendChanged:false,nginxChanged:false}),{mode:0o600})
    console.log('COMMUNITY_PAGE_PUBLISHED: новая страница подтверждена по публичному HTML и '+bundle.assets.length+' JS/CSS. Опубликованы новая титульная с кнопкой, сравнение 11 возможностей с кнопкой под галочками, география с университетами справа, равные тарифы 1–6–3 месяца с выбором 6 месяцев, циклическая лента 10 амбассадоров и заявка по кнопке, достижения с тремя оригинальными изображениями (сертификат РАСО, благодарность и рейтинг), компактные отзывы, основатель после отзывов и FAQ в две колонки с кнопкой вступления. Расчёт трёх тарифов и KQ1111 → 350 ₽ проверен. https://legalcareerist.ru/community')
    console.log('Резервная копия: '+backup)
  }catch(error){
    let restored=false
    try{restoreStatic(target.root,backup);restored=fs.readFileSync(path.join(target.root,'index.html'),'utf8')===target.html}catch{}
    throw Error(error.message+'. '+(restored?'Прежние файлы сайта восстановлены.':'Восстановление не подтверждено.')+' Резервная копия: '+backup)
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error('ПУБЛИКАЦИЯ НЕ ПОДТВЕРЖДЕНА: '+error.message);process.exitCode=1})
