// components/shared/AnalyticsScripts.jsx — GA4 + Yandex Metrica, each loaded ONLY
// when its env id is present. No ids → nothing rendered (no broken scripts).
"use client";
import Script from "next/script";

export default function AnalyticsScripts() {
  const ga = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const ym = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID;

  return (
    <>
      {ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      ) : null}

      {ym ? (
        <Script id="ym-init" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${ym},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}
        </Script>
      ) : null}
    </>
  );
}
