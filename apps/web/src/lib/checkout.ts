import { z } from 'zod';
import type { Delivery } from '@checkout/contracts';
import type { ApiFailure } from '../api/client';
import type { CheckoutFormState } from '../store/checkoutSlice';

export const checkoutSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(2, 'Укажите имя от 2 символов.').max(100),
      email: z.string().trim().email('Укажите корректный email.').max(150),
      phone: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Формат: +79990000000.'),
    }),
    deliveryMode: z.enum(['pickup', 'courier']),
    pickupPointId: z.string().min(1, 'Выберите пункт выдачи.'),
    address: z.object({
      city: z.string().trim().max(100),
      street: z.string().trim().max(150),
      house: z.string().trim().max(20),
      apartment: z.string().trim().max(20),
    }),
    paymentMethod: z.enum(['card', 'cash_on_delivery']),
    selectedCardId: z.string(),
  })
  .superRefine((values, context) => {
    if (values.deliveryMode !== 'courier') return;
    if (values.address.city.length < 2) {
      context.addIssue({ code: 'custom', path: ['address', 'city'], message: 'Укажите город.' });
    }
    if (values.address.street.length < 2) {
      context.addIssue({ code: 'custom', path: ['address', 'street'], message: 'Укажите улицу.' });
    }
    if (!values.address.house) {
      context.addIssue({ code: 'custom', path: ['address', 'house'], message: 'Укажите дом.' });
    }
  });

export const deliveryFromForm = (values: CheckoutFormState): Delivery => {
  if (values.deliveryMode === 'pickup') {
    return { method: 'pickup', pickupPointId: values.pickupPointId };
  }
  const apartment = values.address.apartment.trim();
  return {
    method: 'courier',
    address: {
      city: values.address.city.trim(),
      street: values.address.street.trim(),
      house: values.address.house.trim(),
      ...(apartment ? { apartment } : {}),
    },
  };
};

const apiFieldNames: Record<string, string> = {
  'body/customer/name': 'customer.name',
  'body/customer/email': 'customer.email',
  'body/customer/phone': 'customer.phone',
  'body/delivery/address/city': 'address.city',
  'body/delivery/address/street': 'address.street',
  'body/delivery/address/house': 'address.house',
};

export const formFieldsFromApi = (error: ApiFailure) => {
  const fields: Array<{ name: string; message: string }> = [];
  for (let index = 0; index < error.fields.length; index += 1) {
    const field = error.fields[index];
    const name = apiFieldNames[field.path];
    if (name) fields.push({ name, message: field.message || 'Проверьте значение поля.' });
  }
  return fields;
};

export const newIdempotencyKey = () => crypto.randomUUID();
