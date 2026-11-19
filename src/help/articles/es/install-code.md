---
title: Instalar el código
summary: Un solo fragmento en la cabecera carga el banner de cookies y el rastreador de Analytics.
tags: fragmento, script, instalar, cabecera
---
Añade el código de instalación en el `<head>` de **todas las páginas**, antes de cualquier otro script que instale cookies. El banner debe cargarse primero para poder retener las demás cookies hasta que el visitante decida.

## Qué contiene el código

- La **configuración del banner** de tu dominio y el **script del banner**.
- Si Analytics está activado para el dominio: el **rastreador de Analytics** con tu clave de sitio (`data-site="…"`).

El rastreador lee la elección del visitante desde el banner, así que no necesitas una segunda solución de consentimiento.

## Dónde encontrarlo

- **Empezar → Instala en tu web**: elige el dominio; si Analytics está desactivado, **Activar Analytics** añade el rastreador al código.
- **Añadir dominio**: tras guardar, marca **Instalar también Analytics** para obtener directamente el código combinado.
- **Configuración → Script de Analytics**: solo la línea del rastreador, para webs que ya tienen el banner.

> ¿Has cambiado el código? Pueden pasar unos minutos hasta que aparezca el primer consentimiento o la primera visita y se marque el paso correspondiente en Empezar.
