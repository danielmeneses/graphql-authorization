import objectPath from 'object-path';
import { mergePolicies } from './policies-manager';

// constants
export const AST_PATH_KEY = '__::AST_PATH::__';
export const PARAMS_KEY = '__::PARAMS::__';
export const POLICIES_KEY = '__::POLICIES::__';
export const LIST_KEY = '__::LIST::__';
export const LIST_LENGTH = '__::LIST_LENGTH::__';
export const INPUT_KEY = '$in';
export const FIELD_KEY = '$out';
export const INPUT_VAL_KEY = '__::INPUT_VAL_KEY::__';
export const ACTION_KEY = '__::ACTION::__';

const { get: _get, set: _set } = objectPath;

const isObj = obj => {
  return obj && typeof obj === 'object' && !obj.hasOwnProperty('length');
};

const isArray = obj => {
  return obj && typeof obj === 'object' && obj.hasOwnProperty('length');
};

const getVariablesTree = obj => {
  const finalTree = {};
  const recurse = (obj, objectPath, treePath) => {
    if (treePath !== '') treePath = treePath + '.';

    const _obj = _get(obj, objectPath);
    if (isObj(_obj) || isArray(obj))
      for (let key in _obj)
        if (obj.hasOwnProperty(key)) {
          const ownPath = isArray(obj)
            ? `${treePath}${key}.${INPUT_KEY}`
            : `${treePath}${INPUT_KEY}.${key}`;
          _set(finalTree, ownPath, {});
          const val = _get(obj, `${objectPath}.${key}`, null);
          if (
            typeof val === 'string' ||
            typeof val === 'number' ||
            typeof val === 'boolean' ||
            !val
          )
            _set(finalTree, `${ownPath}.${INPUT_VAL_KEY}`, val);
          else if (_get(obj, `${objectPath}.${key}`, null))
            recurse(obj, `${objectPath}.${key}`, ownPath);
        }
  };
  recurse(obj, '', '');
  return finalTree;
};

export const parseRulesOrQuery = ({
  AST,
  parseConfigs = false,
  policies,
  variables = {}
}) => {
  let finalObj = {};
  const getOwnPath = (kind, ownPath, obj) => {
    if (ownPath) ownPath = ownPath + '.';
    switch (kind) {
      case 'Field':
        return `${ownPath}${FIELD_KEY}.${obj.name.value}`;
      case 'Argument':
      case 'ObjectField':
        return `${ownPath}${INPUT_KEY}.${obj.name.value}`;
      case 'ListValue':
        return `${ownPath}${LIST_KEY}`;
      case 'OperationDefinition':
        return `${ownPath}${obj.operation}`;
    }
  };

  let lookupList = ['fields', 'values', 'value.values', 'value.fields'];
  const recurse = (astObj, path, ownPath, policies) => {
    if (!astObj) return;
    const obj = _get(astObj, path, null);
    if (isObj(obj)) {
      const kind = obj.kind;
      let config = {};
      let nextKind = null;
      // let fieldVal = null;
      switch (kind) {
        case 'OperationDefinition':
        case 'Field':
        case 'Argument':
        case 'ListValue':
        case 'ObjectField': // inner input type
        case 'ObjectValue':
          if (kind === 'ObjectValue') {
            recurse(astObj, `${path}.fields`, ownPath, policies);
            break;
          } else if (_get(obj, 'value.kind', null) === 'Variable') {
            const name = obj.value.name.value;
            const val = variables[name];
            if (
              typeof val === 'string' ||
              typeof val === 'number' ||
              typeof val === 'boolean' ||
              !val
            )
              _set(
                finalObj,
                `${ownPath}.${INPUT_KEY}.${obj.name.value}.${INPUT_VAL_KEY}`,
                val
              );
            else
              _set(
                finalObj,
                `${ownPath}.${INPUT_KEY}.${obj.name.value}`,
                getVariablesTree(val)
              );
            break;
          } else if (kind === 'Field' && obj.alias) {
            ownPath = `${ownPath}.${FIELD_KEY}.${obj.alias.value}`;
            _set(finalObj, ownPath, {
              [ACTION_KEY]: obj.name.value
            });
          } else {
            ownPath = getOwnPath(kind, ownPath, obj);
            _set(finalObj, ownPath, {});
          }

          // set config data

          if (parseConfigs) {
            nextKind = _get(obj, `loc.startToken.prev.kind`, null); // loc.endToken.next.kind
            if (nextKind === 'Comment') {
              config = _get(obj, `loc.startToken.prev.value`, null); // loc.endToken.next.kind
              try {
                config = JSON.parse(config);
                policies = mergePolicies(policies, config);
                if (config.DROP) delete config.DROP;
                if (config.ACCEPT) delete config.ACCEPT;
                _set(finalObj, ownPath + '.' + PARAMS_KEY, config);
              } catch (e) {
                console.error(e);
                // handle
              }
            }
            _set(finalObj, `${ownPath}.${POLICIES_KEY}`, policies);
          }
          _set(finalObj, `${ownPath}.${AST_PATH_KEY}`, path);

          // try to save values
          if (obj.value && obj.value.value)
            if (obj.value.kind === 'IntValue') {
              const _int = parseInt(obj.value.value, 10);
              _set(
                finalObj,
                `${ownPath}.${INPUT_VAL_KEY}`,
                _int === _int ? _int : null
              );
            } else if (
              obj.value.kind === 'StringValue' ||
              obj.value.kind === 'BooleanValue' ||
              obj.value.kind === 'EnumValue'
            ) {
              _set(finalObj, `${ownPath}.${INPUT_VAL_KEY}`, obj.value.value);
            }

          // get inner arguments
          for (let i = 0; i < lookupList.length; i++) {
            let prop = null;
            if ((prop = _get(obj, lookupList[i], null)))
              if (
                false ||
                lookupList[i] === 'value.values' ||
                lookupList[i] === 'values'
              ) {
                for (let e = 0; e < prop.length; e++)
                  switch (prop[e].kind) {
                    case 'StringValue':
                    case 'IntValue':
                    case 'BooleanValue':
                    case 'EnumValue':
                      _set(
                        finalObj,
                        `${ownPath}.${e}.${INPUT_KEY}.${INPUT_VAL_KEY}`,
                        prop[e].kind === 'IntValue'
                          ? parseInt(prop[e].value, 10)
                          : prop[e].value
                      );
                      break;
                    default:
                      recurse(
                        astObj,
                        `${path}.${lookupList[i]}.${e}`,
                        `${ownPath}.${e}`,
                        policies
                      );
                  }

                break;
              } else {
                recurse(astObj, `${path}.${lookupList[i]}`, ownPath, policies);
                break;
              }
          }
          break;
      }

      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const _key = keys[i];
        const nextPath = `${path}.${_key}`;

        switch (_key) {
          case 'operation':
          case 'definitions': // definitions - object root
          case 'selectionSet': // new item
          case 'selections': // selections in a selectionSet (Field)
          case 'arguments': // for arguments
          case 'fields': // for arguments
            recurse(astObj, nextPath, ownPath, policies);
            break;
        }
      }
    } else if (isArray(obj))
      for (let i = 0; i < obj.length; i++)
        recurse(astObj, `${path}.${i}`, ownPath, policies);
  };
  recurse(AST, AST.definitions ? 'definitions' : 'operation', '', policies);
  return finalObj;
};
