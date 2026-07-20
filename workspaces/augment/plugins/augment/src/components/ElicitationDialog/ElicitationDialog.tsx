/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/** A single primitive field definition from MCP's elicitation requestedSchema. */
type PrimitiveField =
  | {
      type: 'string';
      enum?: string[];
      oneOf?: Array<{ const: string; title: string }>;
      default?: string;
      minLength?: number;
      maxLength?: number;
      format?: string;
    }
  | {
      type: 'number' | 'integer';
      minimum?: number;
      maximum?: number;
      default?: number;
    }
  | { type: 'boolean'; default?: boolean }
  | {
      type: 'array';
      items: {
        enum?: string[];
        anyOf?: Array<{ const: string; title: string }>;
      };
      default?: string[];
    };

export interface ElicitationRequestedSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ElicitationDialogProps {
  elicitationId: string;
  message: string;
  requestedSchema: ElicitationRequestedSchema;
  onSubmit: (elicitationId: string, content: Record<string, unknown>) => void;
  onDecline: (elicitationId: string) => void;
  onCancel: (elicitationId: string) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

function getEnumOptions(
  field: PrimitiveField,
): Array<{ value: string; label: string }> | null {
  if (field.type === 'string') {
    if (field.oneOf)
      return field.oneOf.map(o => ({ value: o.const, label: o.title }));
    if (field.enum) return field.enum.map(v => ({ value: v, label: v }));
  }
  if (field.type === 'array') {
    const items = field.items;
    if (items.anyOf)
      return items.anyOf.map(o => ({ value: o.const, label: o.title }));
    if (items.enum) return items.enum.map(v => ({ value: v, label: v }));
  }
  return null;
}

function FieldInput({
  name,
  field,
  required,
  value,
  onChange,
}: {
  name: string;
  field: PrimitiveField;
  required: boolean;
  value: unknown;
  onChange: (name: string, val: unknown) => void;
}) {
  const label = name;

  if (field.type === 'boolean') {
    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={!!value}
            onChange={e => onChange(name, e.target.checked)}
          />
        }
        label={label}
      />
    );
  }

  if (field.type === 'array') {
    const options = getEnumOptions(field) ?? [];
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <FormControl component="fieldset" margin="dense" fullWidth>
        <FormLabel component="legend">
          {label}
          {required && ' *'}
        </FormLabel>
        <FormGroup>
          {options.map(opt => (
            <FormControlLabel
              key={opt.value}
              control={
                <Checkbox
                  checked={selected.includes(opt.value)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter(v => v !== opt.value);
                    onChange(name, next);
                  }}
                />
              }
              label={opt.label}
            />
          ))}
        </FormGroup>
      </FormControl>
    );
  }

  const options = getEnumOptions(field);
  if (options) {
    return (
      <FormControl fullWidth margin="dense" required={required}>
        <InputLabel>{label}</InputLabel>
        <Select
          value={typeof value === 'string' ? value : ''}
          label={label}
          onChange={e => onChange(name, e.target.value)}
        >
          {options.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  // Plain text / number field
  return (
    <TextField
      fullWidth
      margin="dense"
      required={required}
      label={label}
      type={
        field.type === 'number' || field.type === 'integer' ? 'number' : 'text'
      }
      value={
        typeof value === 'string' || typeof value === 'number' ? value : ''
      }
      onChange={e => {
        const raw = e.target.value;
        if (field.type === 'number' || field.type === 'integer') {
          onChange(name, raw === '' ? '' : Number(raw));
        } else {
          onChange(name, raw);
        }
      }}
      inputProps={{
        ...(field.type === 'string' &&
        (field as { minLength?: number }).minLength !== undefined
          ? { minLength: (field as { minLength?: number }).minLength }
          : {}),
        ...(field.type === 'string' &&
        (field as { maxLength?: number }).maxLength !== undefined
          ? { maxLength: (field as { maxLength?: number }).maxLength }
          : {}),
      }}
    />
  );
}

function buildInitialValues(
  schema: ElicitationRequestedSchema,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [name, rawField] of Object.entries(schema.properties)) {
    const field = rawField as PrimitiveField;
    if (field.type === 'boolean')
      values[name] = (field as { default?: boolean }).default ?? false;
    else if (field.type === 'array')
      values[name] = (field as { default?: string[] }).default ?? [];
    else values[name] = (field as { default?: string | number }).default ?? '';
  }
  return values;
}

export function ElicitationDialog({
  elicitationId,
  message,
  requestedSchema,
  onSubmit,
  onDecline,
  onCancel,
  isSubmitting,
  error,
}: ElicitationDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(requestedSchema),
  );

  const handleChange = useCallback((name: string, val: unknown) => {
    setValues(prev => ({ ...prev, [name]: val }));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(elicitationId, values);
  }, [elicitationId, values, onSubmit]);

  const fields = Object.entries(requestedSchema.properties);
  const requiredSet = new Set(requestedSchema.required ?? []);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'warning.main',
        borderRadius: 2,
        p: 2.5,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        Tool needs your input
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {message}
      </Typography>

      {fields.map(([name, rawField]) => (
        <FieldInput
          key={name}
          name={name}
          field={rawField as PrimitiveField}
          required={requiredSet.has(name)}
          value={values[name]}
          onChange={handleChange}
        />
      ))}

      {error && (
        <Typography
          variant="caption"
          color="error"
          sx={{ display: 'block', mt: 1 }}
        >
          {error}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          variant="text"
          color="inherit"
          onClick={() => onCancel(elicitationId)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="warning"
          onClick={() => onDecline(elicitationId)}
          disabled={isSubmitting}
        >
          Decline
        </Button>
        <Button
          size="small"
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={14} /> : undefined}
        >
          Submit
        </Button>
      </Box>
    </Box>
  );
}
