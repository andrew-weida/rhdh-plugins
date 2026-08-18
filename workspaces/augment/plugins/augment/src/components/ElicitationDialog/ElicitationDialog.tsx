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

import { useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme, alpha } from '@mui/material/styles';
import type { PendingElicitationInfo } from '../StreamingMessage/StreamingMessage.types';

interface ElicitationDialogProps {
  elicitation: PendingElicitationInfo;
  onSubmit: (values: Record<string, unknown>) => void;
  onDecline: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

type ConstOption = { const: string; title?: string };

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  format?: string;
  minimum?: number;
  maximum?: number;
  items?: {
    type?: string;
    enum?: string[];
    anyOf?: Array<{ const?: string; title?: string }>;
  };
  oneOf?: Array<{ const?: string; title?: string }>;
};

function getDefaultValue(prop: SchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default;
  switch (prop.type) {
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return '';
    case 'array':
      return [];
    default:
      return '';
  }
}

export function ElicitationDialog({
  elicitation,
  onSubmit,
  onDecline,
  isSubmitting = false,
  error = null,
}: ElicitationDialogProps) {
  const theme = useTheme();
  const properties = useMemo(
    () => elicitation.requestedSchema.properties || {},
    [elicitation.requestedSchema.properties],
  );
  const required = useMemo(
    () => new Set(elicitation.requestedSchema.required || []),
    [elicitation.requestedSchema.required],
  );

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const [key, rawProp] of Object.entries(properties)) {
      const prop = rawProp as SchemaProperty;
      initial[key] = getDefaultValue(prop);
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const [key, rawProp] of Object.entries(properties)) {
      const prop = rawProp as SchemaProperty;
      const val = values[key];
      const isRequired = required.has(key);

      if (isRequired) {
        if (val === '' || val === undefined || val === null) {
          result[key] = 'This field is required';
          continue;
        }
        if (Array.isArray(val) && val.length === 0) {
          result[key] = 'At least one option must be selected';
          continue;
        }
      }

      if (val === '' || val === undefined) continue;

      const isNumeric = prop.type === 'number' || prop.type === 'integer';
      if (isNumeric) {
        const num = Number(val);
        const min =
          prop.minimum !== undefined ? Number(prop.minimum) : undefined;
        const max =
          prop.maximum !== undefined ? Number(prop.maximum) : undefined;
        if (Number.isNaN(num)) {
          result[key] = 'Must be a valid number';
        } else if (prop.type === 'integer' && !Number.isInteger(num)) {
          result[key] = 'Must be a whole number';
        } else if (min !== undefined && num < min) {
          result[key] = `Must be at least ${min}`;
        } else if (max !== undefined && num > max) {
          result[key] = `Must be at most ${max}`;
        }
      } else if (typeof val === 'string') {
        if (prop.minLength !== undefined && val.length < prop.minLength) {
          result[key] = `Must be at least ${prop.minLength} characters`;
        } else if (
          prop.maxLength !== undefined &&
          val.length > prop.maxLength
        ) {
          result[key] = `Must be at most ${prop.maxLength} characters`;
        }
      }
    }
    return result;
  }, [values, properties, required]);

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== '' && val !== undefined) {
        const prop = properties[key] as SchemaProperty | undefined;
        if (prop?.type === 'number' || prop?.type === 'integer') {
          cleaned[key] = Number(val);
        } else {
          cleaned[key] = val;
        }
      }
    }
    onSubmit(cleaned);
  }, [values, properties, onSubmit, validate]);

  const propertyEntries = Object.entries(properties);

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ color: theme.palette.info.main }}>
          Elicitation Request
        </Typography>
      </Box>

      <Typography
        variant="body2"
        sx={{ mb: 2, color: theme.palette.text.secondary }}
      >
        {elicitation.message}
      </Typography>

      <br />
      <Box
        sx={{
          borderTop: `1px solid ${theme.palette.text.disabled}`,
        }}
      />
      <br />
      <br />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {propertyEntries.map(([key, rawProp]) => {
          const prop = rawProp as SchemaProperty;
          const isRequired = required.has(key);
          const displayName = prop.title ?? key;
          const label = displayName;

          if (prop.type === 'boolean') {
            return (
              <Box key={key}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {displayName}
                </Typography>
                <Box sx={{ pl: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!!values[key]}
                        onChange={e => handleChange(key, e.target.checked)}
                        disabled={isSubmitting}
                        size="small"
                      />
                    }
                    label={displayName}
                  />
                </Box>
                {prop.description && (
                  <Typography
                    variant="caption"
                    sx={{ display: 'block', color: 'text.secondary', pl: 1 }}
                  >
                    {prop.description}
                  </Typography>
                )}
              </Box>
            );
          }

          if (prop.enum) {
            return (
              <TextField
                key={key}
                select
                SelectProps={{ native: true }}
                size="small"
                fullWidth
                label={label}
                value={values[key] as string}
                onChange={e => handleChange(key, e.target.value)}
                error={!!errors[key]}
                helperText={errors[key] || prop.description}
                required={isRequired}
                disabled={isSubmitting}
              >
                <option value="" />
                {prop.enum.map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </TextField>
            );
          }

          if (prop.oneOf?.some(o => o.const !== undefined)) {
            const options = prop.oneOf.filter(
              (o): o is { const: string; title?: string } =>
                o.const !== undefined,
            );
            return (
              <TextField
                key={key}
                select
                SelectProps={{ native: true }}
                size="small"
                fullWidth
                label={label}
                value={values[key] as string}
                onChange={e => handleChange(key, e.target.value)}
                error={!!errors[key]}
                helperText={errors[key] || prop.description}
                required={isRequired}
                disabled={isSubmitting}
              >
                <option value="" />
                {options.map(opt => (
                  <option key={opt.const} value={opt.const}>
                    {opt.title ?? opt.const}
                  </option>
                ))}
              </TextField>
            );
          }

          if (prop.type === 'array') {
            const selected = (values[key] as string[]) || [];

            const anyOfOptions = prop.items?.anyOf?.filter(
              (o): o is ConstOption => o.const !== undefined,
            );
            if (anyOfOptions?.length) {
              return (
                <Box key={key}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', pl: 1 }}>
                    {anyOfOptions.map(opt => (
                      <FormControlLabel
                        key={opt.const}
                        control={
                          <Checkbox
                            checked={selected.includes(opt.const)}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...selected, opt.const]
                                : selected.filter(s => s !== opt.const);
                              handleChange(key, next);
                            }}
                            disabled={isSubmitting}
                            size="small"
                          />
                        }
                        label={opt.title ?? opt.const}
                      />
                    ))}
                  </Box>
                  {prop.description && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'text.secondary', pl: 1 }}
                    >
                      {prop.description}
                    </Typography>
                  )}
                  {errors[key] && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'error.main', pl: 1 }}
                    >
                      {errors[key]}
                    </Typography>
                  )}
                </Box>
              );
            }

            if (prop.items?.enum) {
              return (
                <Box key={key}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', pl: 1 }}>
                    {prop.items.enum.map(opt => (
                      <FormControlLabel
                        key={opt}
                        control={
                          <Checkbox
                            checked={selected.includes(opt)}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...selected, opt]
                                : selected.filter(s => s !== opt);
                              handleChange(key, next);
                            }}
                            disabled={isSubmitting}
                            size="small"
                          />
                        }
                        label={opt}
                      />
                    ))}
                  </Box>
                  {prop.description && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'text.secondary', pl: 1 }}
                    >
                      {prop.description}
                    </Typography>
                  )}
                  {errors[key] && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'error.main', pl: 1 }}
                    >
                      {errors[key]}
                    </Typography>
                  )}
                </Box>
              );
            }
          }

          const formatToType: Record<string, string> = {
            email: 'email',
            uri: 'url',
            date: 'date',
            'date-time': 'datetime-local',
          };
          const isNumeric = prop.type === 'number' || prop.type === 'integer';
          const inputType = isNumeric
            ? 'number'
            : (prop.format && formatToType[prop.format]) || 'text';

          const constraintHint = isNumeric
            ? [
                prop.minimum !== undefined ? `min: ${prop.minimum}` : '',
                prop.maximum !== undefined ? `max: ${prop.maximum}` : '',
              ]
                .filter(Boolean)
                .join(', ')
            : [
                prop.minLength !== undefined
                  ? `min length: ${prop.minLength}`
                  : '',
                prop.maxLength !== undefined
                  ? `max length: ${prop.maxLength}`
                  : '',
              ]
                .filter(Boolean)
                .join(', ');

          const helperParts = [prop.description, constraintHint]
            .filter(Boolean)
            .join(' — ');

          return (
            <TextField
              key={key}
              label={label}
              value={values[key] as string}
              onChange={e => handleChange(key, e.target.value)}
              type={isNumeric ? 'text' : inputType}
              inputProps={isNumeric ? { inputMode: 'numeric' as const } : {}}
              error={!!errors[key]}
              helperText={errors[key] || helperParts}
              required={isRequired}
              disabled={isSubmitting}
              size="small"
              fullWidth
            />
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 2,
          p: 1.5,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.warning.main, 0.1),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{ color: theme.palette.warning.dark, mb: 0.5 }}
        >
          Warning
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: theme.palette.warning.dark }}
        >
          Only provide information you trust this server with.
          {elicitation.serverLabel &&
            ` The server "${elicitation.serverLabel}" is requesting this data.`}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={onDecline}
          disabled={isSubmitting}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={14} /> : undefined}
        >
          Submit
        </Button>
      </Box>

      {error && (
        <Typography
          variant="caption"
          sx={{
            color: 'error.main',
            mt: 1,
            textAlign: 'center',
            display: 'block',
          }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
}
