export function fft(input) {
    const n = input.real.length;
    if (n === 0) {
        return { real: [], imag: [] };
    }
    if ((n & (n - 1)) !== 0) {
        console.warn("FFT size must be a power of 2. Received:", n);
        return input;
    }

    const real = [...input.real];
    const imag = [...input.imag];

    // Bit-reversal permutation
    const reverse = new Uint32Array(n);
    for (let i = 1; i < n; i++) {
        reverse[i] = (reverse[i >> 1] >> 1) | ((i & 1) ? n >> 1 : 0);
        if (i < reverse[i]) {
            [real[i], real[reverse[i]]] = [real[reverse[i]], real[i]];
            [imag[i], imag[reverse[i]]] = [imag[reverse[i]], imag[i]];
        }
    }

    // Cooley-Tukey algorithm
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = -2 * Math.PI / len;
        const w_real = Math.cos(angle);
        const w_imag = Math.sin(angle);

        for (let i = 0; i < n; i += len) {
            let t_real = 1;
            let t_imag = 0;
            for (let j = 0; j < halfLen; j++) {
                const u_real = real[i + j];
                const u_imag = imag[i + j];
                const v_real = real[i + j + halfLen] * t_real - imag[i + j + halfLen] * t_imag;
                const v_imag = real[i + j + halfLen] * t_imag + imag[i + j + halfLen] * t_real;

                real[i + j] = u_real + v_real;
                imag[i + j] = u_imag + v_imag;
                real[i + j + halfLen] = u_real - v_real;
                imag[i + j + halfLen] = u_imag - v_imag;

                const next_t_real = t_real * w_real - t_imag * w_imag;
                t_imag = t_real * w_imag + t_imag * w_real;
                t_real = next_t_real;
            }
        }
    }
    return { real, imag };
}
