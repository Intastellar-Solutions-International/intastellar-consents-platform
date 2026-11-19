---
title: Diseños y ajustes del banner
summary: Los cinco diseños de banner y qué hace cada ajuste en Añadir dominio.
tags: banner, diseño, estilo, color, logotipo, dominios asociados
---
Eliges el aspecto del banner al añadir un dominio. El ajuste se guarda como `design` en la configuración del banner del dominio.

## Diseños

- **Ventana emergente** (`overlay`): una tarjeta compacta abajo en el centro. El patrón de consentimiento más conocido y el predeterminado.
- **Ancho** (`banner`): una barra a todo el ancho, con logotipo y botones en un panel lateral.
- **Ancho V2** (`bannerV2`): la barra ancha actualizada con panel lateral.
- **Nova** (`nova`): una tarjeta azul marino y dorada con una insignia de cookie flotante.
- **Premium** (`premium`): una tarjeta sencilla y neutra que no estorba.

Nova y Premium usan sus propios colores fijos, así que el color de marca no se les aplica.

## Ajustes

- **URL de la política de privacidad**: enlazada desde el banner, se abre en una pestaña nueva.
- **Nombre de la empresa**: aparece en el texto del banner.
- **URL del logotipo** _(opcional)_: aparece en los diseños que tienen espacio para él.
- **Color de marca**: el color de los botones (no se usa en Nova ni Premium). El texto de los botones alterna entre oscuro y claro para seguir siendo legible.
- **Posición**: diseños anchos: logotipo y botones a la derecha o a la izquierda. Nova y Premium: esquina inferior derecha o izquierda. La ventana emergente siempre está centrada.
- **Cookies necesarias**: cookies estrictamente necesarias, siempre permitidas, por ejemplo una cookie de sesión como `PHPSESSID`.
- **Dominios asociados**: otros dominios tuyos que deben compartir el consentimiento del visitante para no preguntarle dos veces.

> Tras cambiar el diseño, el código de instalación sigue siendo el mismo: el banner lee su configuración en cada página vista.

Relacionado: [Instalar el código](help:install-code)
