function hexToRgb(hex) { 
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); 
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; 
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b); 
    let h, s, l = (max + min) / 2; 
    if (max == min) { 
        h = s = 0; 
    } else { 
        let d = max - min; 
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min); 
        switch (max) { 
        case r: h = (g - b) / d + (g < b ? 6 : 0); 
            break; 
        case g: h = (b - r) / d + 2; 
            break; 
        case b: h = (r - g) / d + 4; 
            break; } 
        h /= 6; 
    } 
    return { h: h * 360, s: s * 100, l: l * 100 }; 
    }

function setInteractColor(hex) { 
    const forbidden = ['#000000', '#ffffff', '#000', '#fff', 'black', 'white']; 
    if (forbidden.includes(hex.toLowerCase())) { return spawnToast("Black and White are reserved.", "remove"); } 
    const rgb = hexToRgb(hex); 
    if(rgb) { 
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b); 
        const compH = (hsl.h + 180) % 360; 
        document.documentElement.style.setProperty('--interact-color', hex); 
        document.documentElement.style.setProperty('--pointer-color', `hsl(${compH}, 80%, 50%)`); 
        document.documentElement.style.setProperty('--pointer-bg', `hsl(${compH}, 80%, 96%)`); 
        document.documentElement.style.setProperty('--pointer-bg-dark', `hsl(${compH}, 70%, 15%)`); 
        localStorage.setItem('distill_interact_color', hex); 
        const input = document.getElementById('interact-color-input'); 
        if(input) input.value = hex; 
        document.documentElement.style.setProperty('--comp-h', compH); 
    } 
}

function saveCustomInteractColor() { 
    const hex = document.getElementById('interact-color-input').value; 
    if (hex) setInteractColor(hex); 
}