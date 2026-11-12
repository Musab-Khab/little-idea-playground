import {describe,expect,it} from 'vitest';
import {amountInWords} from '@/lib/amountInWords';
describe('amount in words',()=>{
 it('uses lakh/thousand grouping',()=>{expect(amountInWords(150500)).toBe('One Lakh Fifty Thousand Five Hundred Rupees Only');});
 it('handles crore',()=>{expect(amountInWords(12345678)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only');});
 it('zero',()=>{expect(amountInWords(0)).toBe('Zero Rupees Only');});
});
